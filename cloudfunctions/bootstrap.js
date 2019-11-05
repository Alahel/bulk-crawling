const { bqDatasetName, batchesResultsTopic, batchesTopic } = require('./config/config')
const { handleReq } = require('./helpers')
const { pubsub, bigquery, jobsTable, crawlingResultsTable } = require('./common')

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

exports.bootstrap = handleReq(async (req, res) => {
  await bootstrapDeps()
  return res.sendStatus(200)
})
