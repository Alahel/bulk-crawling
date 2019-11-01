const path = require('path')
const {
  IMPORT_STATUS_RUNNING,
  IMPORT_STATUS_COMPLETED,
  IMPORT_STATUS_ERROR,
  IMPORT_STATUS_PENDING,
} = require('./constants')
const { BigQuery } = require('@google-cloud/bigquery')
const { NotFound } = require('http-errors')
const { projectId, bqDatasetName } = require('./config/config')
const { serializeDate } = require('./helpers')

const bigquery = new BigQuery({
  projectId,
  keyFilename: path.join('.', 'config', 'sa.json'),
})
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
        [IMPORT_STATUS_COMPLETED]: processed = 0,
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
  const totalProcessed = processed + errors
  let status = totalProcessed > 0 ? IMPORT_STATUS_RUNNING : IMPORT_STATUS_PENDING
  const errorRate = totalProcessed > 0 ? `${Math.ceil((errors * 100) / total)}%` : null
  if (totalProcessed >= total) status = IMPORT_STATUS_COMPLETED
  if (status === IMPORT_STATUS_RUNNING && parsedStartedAt) duration = new Date() - parsedStartedAt
  if (status === IMPORT_STATUS_COMPLETED && parsedStartedAt) {
    endedAt = parsedLastProcessedAt
    duration = endedAt - parsedStartedAt
  }
  if (duration > 0) throughput = totalProcessed / duration
  return {
    jobId,
    options: parsedOptions,
    total,
    processed,
    errors,
    status,
    errorRate,
    throughput: throughput ? `${Number(throughput * 1000).toFixed(2)}/s` : null,
    queuedAt: serializeDate(parsedQueuedAt),
    startedAt: serializeDate(parsedStartedAt),
    lastProcessedAt: serializeDate(parsedLastProcessedAt),
    endedAt: serializeDate(endedAt),
    duration: duration ? `${Math.ceil(duration / 1000)}s` : null,
  }
}

module.exports = {
  bigquery,
  jobsTableRef,
  crawlingResultsTableRef,
  getJobDoc,
  getJob,
}
