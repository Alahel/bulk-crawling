const { crawlingResultsTableRef } = require('./common')
const { deserialize } = require('./helpers')

const crawlResult = async ({ event }) => {
  const { jobId, status, url, at } = deserialize(event)
  await crawlingResultsTableRef.insert({
    jobId,
    status,
    url,
    at,
  })
}

exports.crawlResult = async (event, context) => {
  await crawlResult({ event, context })
}
