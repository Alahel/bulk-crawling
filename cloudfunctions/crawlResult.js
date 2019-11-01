const { bigquery, crawlingResultsTableRef } = require('./common')
const { deserialize } = require('./helpers')

const crawlResult = async ({ event }) => {
  const { jobId, status, url, at } = deserialize(event)
  await crawlingResultsTableRef.insert({
    jobId,
    status,
    url,
    at: bigquery.datetime(at),
  })
}

exports.crawlResult = async (event, context) => {
  await crawlResult({ event, context })
}
