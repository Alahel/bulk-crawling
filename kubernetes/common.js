const express = require('express')
const path = require('path')
const {
  IMPORT_STATUS_RUNNING,
  IMPORT_STATUS_COMPLETED,
  IMPORT_STATUS_ERROR,
  IMPORT_STATUS_PENDING,
} = require('./constants')
const {
  port,
  projectId,
  bqDatasetName,
  maxMessagesPerSubscription,
  batchesResultsTopic,
  batchesTopic,
} = require('./config/config')
const { BigQuery } = require('@google-cloud/bigquery')
const { NotFound } = require('http-errors')
const { PubSub } = require('@google-cloud/pubsub')
const { serializeDate } = require('./helpers')
const { Storage } = require('@google-cloud/storage')

const serviceAccountOpts = {
  projectId,
  keyFilename: path.join('.', 'config', 'sa.json'),
}
const pubsub = new PubSub(serviceAccountOpts)
const bigquery = new BigQuery(serviceAccountOpts)
const gcs = new Storage(serviceAccountOpts)
const dataset = bigquery.dataset(bqDatasetName)
const datasetRoot = `${projectId}.${bqDatasetName}`
const jobsTable = 'jobs'
const crawlingResultsTable = 'crawlingResults'
const jobsTableRef = dataset.table(jobsTable)
const crawlingResultsTableRef = dataset.table(crawlingResultsTable)

const bqDatetimeToDate = date => (date ? new Date(date) : undefined)

const getJobDoc = async jobId => {
  const [[job]] = await bigquery.query({
    query: `SELECT * FROM \`${datasetRoot}.${jobsTable}\` WHERE jobId = @jobId LIMIT 1`,
    params: {
      jobId,
    },
  })
  return {
    job,
  }
}

const getDurationOutput = duration => (duration ? `${Math.ceil(duration / 1000)}s` : null)

const getThroughputOutput = throughput => (throughput ? `${Number(throughput * 1000).toFixed(2)}/s` : null)

const getJob = async jobId => {
  const { job } = await getJobDoc(jobId)
  if (!job) throw new NotFound(`job does not exists`)
  const { options, total, queuedAt } = job
  const statsResults = await bigquery.query({
    query: `
      select jobId, 
        sum(${IMPORT_STATUS_COMPLETED}) as ${IMPORT_STATUS_COMPLETED}, 
        sum(${IMPORT_STATUS_ERROR}) as ${IMPORT_STATUS_ERROR},
        min(\`at\`) as mini,
        max(\`at\`) as maxi
        from (
          select jobId,
          \`at\`,
          case when status = '${IMPORT_STATUS_COMPLETED}' then 1 else 0 end as ${IMPORT_STATUS_COMPLETED},
          case when status = '${IMPORT_STATUS_ERROR}' then 1 else 0 end as ${IMPORT_STATUS_ERROR} 
          from \`${datasetRoot}.${crawlingResultsTable}\`
          where jobId = @jobId
        )
      group by jobId
      limit 1`,
    params: {
      jobId,
    },
  })
  const [
    [
      {
        [IMPORT_STATUS_COMPLETED]: completed = 0,
        [IMPORT_STATUS_ERROR]: errors = 0,
        mini: startedAt = undefined,
        maxi: lastProcessedAt = undefined,
      } = {},
    ] = [],
  ] = statsResults || []
  const parsedOptions = JSON.parse(options)
  const parsedQueuedAt = bqDatetimeToDate(queuedAt)
  const parsedStartedAt = bqDatetimeToDate(startedAt)
  const parsedLastProcessedAt = bqDatetimeToDate(lastProcessedAt)
  let endedAt = null
  let duration = undefined
  let throughput = null
  let processedThroughput = null
  let processedDuration = undefined
  const totalProcessed = completed + errors
  let status = totalProcessed > 0 ? IMPORT_STATUS_RUNNING : IMPORT_STATUS_PENDING
  const errorRate = totalProcessed > 0 ? `${Math.ceil((errors * 100) / total)}%` : null
  // Consider a total number of 99.9% as completed (quotas + random of the cloud infra)
  if (totalProcessed >= total * 0.999) status = IMPORT_STATUS_COMPLETED
  if (status === IMPORT_STATUS_RUNNING && parsedStartedAt)
    duration = new Date(new Date().toISOString()) - parsedQueuedAt
  if (status === IMPORT_STATUS_COMPLETED && parsedStartedAt && parsedLastProcessedAt) {
    endedAt = parsedLastProcessedAt
    duration = parsedLastProcessedAt - parsedStartedAt
  }
  if (parsedLastProcessedAt && parsedStartedAt) {
    processedDuration = parsedLastProcessedAt - parsedStartedAt
  }
  if (duration > 0) throughput = totalProcessed / duration
  if (processedDuration > 0) processedThroughput = totalProcessed / processedDuration
  return {
    jobId,
    options: parsedOptions,
    total,
    completed,
    errors,
    status,
    errorRate,
    throughput: getThroughputOutput(throughput),
    processedThroughput: getThroughputOutput(processedThroughput),
    queuedAt: serializeDate(parsedQueuedAt),
    startedAt: serializeDate(parsedStartedAt),
    lastProcessedAt: serializeDate(parsedLastProcessedAt),
    endedAt: serializeDate(endedAt),
    duration: getDurationOutput(duration),
    processedDuration: getDurationOutput(processedDuration),
  }
}

const bootstrapSubscription = async ({ topicName, subscriptionName } = {}) => {
  const topic = pubsub.topic(topicName)
  console.log(`checking subscriptions for ${topic.name}...`)
  const [subscriptions] = await topic.getSubscriptions()
  const needCreate = !subscriptions.some(subscription => subscription.name === subscription.name)
  if (needCreate) {
    console.log(`creating subscription ${subscriptionName} for ${topic.name}...`)
    await topic.createSubscription(subscriptionName)
  }
  const subscription = pubsub.subscription(subscriptionName, {
    flowControl: {
      maxMessages: maxMessagesPerSubscription,
    },
  })
  return {
    topic,
    subscription,
  }
}

const addHealthCheck = app => {
  app.get('/health', (req, res) => res.sendStatus(200))
}
const addLastListener = app => {
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.sendStatus(err ? 500 : 404))
}

const bootstrapHealthCheckServer = () => {
  const app = express()
  addHealthCheck(app)
  addLastListener(app)
  app.listen(port, () => {
    console.log(`Server listening on ${port}`)
  })
  return app
}

const bootstrapDeps = async () => {
  await pubsub.createTopic(batchesResultsTopic)
  await pubsub.createTopic(batchesTopic)
  await bigquery.createDataset(bqDatasetName)
  await Promise.all([
    bigquery.dataset(bqDatasetName).createTable(jobsTable, {
      schema: {
        fields: [
          {
            name: 'jobId',
            type: 'STRING',
            mode: 'REQUIRED',
          },
          {
            name: 'options',
            type: 'STRING',
            mode: 'REQUIRED',
          },
          {
            name: 'total',
            type: 'INT64',
            mode: 'REQUIRED',
          },
          {
            name: 'queuedAt',
            type: 'STRING',
            mode: 'REQUIRED',
          },
        ],
      },
    }),
    bigquery.dataset(bqDatasetName).createTable(crawlingResultsTable, {
      schema: {
        fields: [
          {
            name: 'jobId',
            type: 'STRING',
            mode: 'REQUIRED',
          },
          {
            name: 'status',
            type: 'STRING',
            mode: 'REQUIRED',
          },
          {
            name: 'url',
            type: 'STRING',
            mode: 'REQUIRED',
          },
          {
            name: 'at',
            type: 'STRING',
            mode: 'REQUIRED',
          },
        ],
      },
    }),
  ])
}

module.exports = {
  gcs,
  pubsub,
  bootstrapSubscription,
  addHealthCheck,
  addLastListener,
  bootstrapHealthCheckServer,
  bigquery,
  bootstrapDeps,
  jobsTableRef,
  crawlingResultsTableRef,
  getJobDoc,
  getJob,
}
