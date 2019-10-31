const uuid = require('uuidv4').default
const { crawlResultsColl } = require('./common')
const { deserialize } = require('./helpers')

const crawlResult = async ({ event }) => {
  const { jobId, status, at, url } = deserialize(event)
  const crawlResultId = uuid()
  const crawlResultRef = crawlResultsColl.doc(crawlResultId)
  await crawlResultRef.set({ jobId, status, at, url })
}

exports.crawlResult = async (event, context) => {
  await crawlResult({ event, context })
}
