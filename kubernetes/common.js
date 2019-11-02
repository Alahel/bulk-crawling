const express = require('express')
const path = require('path')
const {
  IMPORT_STATUS_RUNNING,
  IMPORT_STATUS_COMPLETED,
  IMPORT_STATUS_ERROR,
  IMPORT_STATUS_PENDING,
} = require('./constants')
const { BigQuery } = require('@google-cloud/bigquery')
const { NotFound } = require('http-errors')
const { port, projectId, bqDatasetName } = require('./config/config')
const { PubSub } = require('@google-cloud/pubsub')
const { serializeDate } = require('./helpers')

const serviceAccountOpts = {
  projectId,
  keyFilename: path.join('.', 'config', 'sa.json'),
}
const pubsub = new PubSub(serviceAccountOpts)
const bigquery = new BigQuery(serviceAccountOpts)
const dataset = bigquery.dataset(bqDatasetName)
const datasetRoot = `${projectId}.${bqDatasetName}`
const jobsTable = 'jobs'
const crawlingResultsTable = 'crawlingResults'
const jobsTableRef = dataset.table(jobsTable)
const crawlingResultsTableRef = dataset.table(crawlingResultsTable)

const bqDatetimeToDate = date => (date ? new Date(date.value) : undefined)

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
  let duration = null
  let throughput = null
  let processedThroughput = null
  let processedDuration = null
  const totalProcessed = completed + errors
  let status = totalProcessed > 0 ? IMPORT_STATUS_RUNNING : IMPORT_STATUS_PENDING
  const errorRate = totalProcessed > 0 ? `${Math.ceil((errors * 100) / total)}%` : null
  // Consider a total number of 99.9% as completed (quotas + random of the cloud infra)
  if (totalProcessed >= total * 0.999) status = IMPORT_STATUS_COMPLETED
  if (status === IMPORT_STATUS_RUNNING && parsedStartedAt) duration = new Date() - parsedStartedAt
  if (status === IMPORT_STATUS_COMPLETED && parsedStartedAt) {
    endedAt = parsedLastProcessedAt
    duration = endedAt - parsedStartedAt
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
    throughput: throughput ? `${Number(throughput * 1000).toFixed(2)}/s` : null,
    processedThroughput: processedThroughput ? `${Number(processedThroughput * 1000).toFixed(2)}/s` : null,
    queuedAt: serializeDate(parsedQueuedAt),
    startedAt: serializeDate(parsedStartedAt),
    lastProcessedAt: serializeDate(parsedLastProcessedAt),
    endedAt: serializeDate(endedAt),
    duration: duration ? `${Math.ceil(duration / 1000)}s` : null,
    processedDuration: processedDuration ? `${Math.ceil(processedDuration / 1000)}s` : null,
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
  return topic
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

module.exports = {
  pubsub,
  bootstrapSubscription,
  addHealthCheck,
  addLastListener,
  bootstrapHealthCheckServer,
  bigquery,
  jobsTableRef,
  crawlingResultsTableRef,
  getJobDoc,
  getJob,
}
