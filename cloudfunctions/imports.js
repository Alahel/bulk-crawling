const chunk = require('lodash/chunk')
const uuid = require('uuidv4').default
const { BadRequest } = require('http-errors')
const { batchesTopic, maxBulkImport, maxRetries, maxTimeout } = require('./config/config')
const { bigquery, jobsTableRef, getJob } = require('./common')
const { handleReq, validateInt, serializeDate } = require('./helpers')
const { PubSub } = require('@google-cloud/pubsub')
const { serialize } = require('./helpers')

const pubsub = new PubSub()
const pubsubTopic = pubsub.topic(batchesTopic)

const importBulk = async ({ urls, batchSize = 1, retries = 0, timeout = 1000 }) => {
  const jobId = uuid()
  await jobsTableRef.insert({
    jobId,
    options: JSON.stringify({
      batchSize,
      retries,
      timeout,
    }),
    total: urls.length,
    queuedAt: bigquery.datetime(serializeDate(new Date())),
  })
  const batchesUrls = batchSize ? chunk(urls, batchSize) : urls
  const batchesLength = batchesUrls.length
  const batchesProms = batchesUrls.map((batchUrls, batchIndex) =>
    pubsubTopic.publish(
      serialize({
        jobId,
        batch: {
          index: batchIndex,
          total: batchesLength,
          urls: batchUrls,
          retries,
          timeout,
        },
      }),
    ),
  )
  // Send async job for proper processing in background
  Promise.all(batchesProms)
  return getJob(jobId)
}

const sanitizeBulkImport = ({ query: { batchSize, retries, timeout }, body }) => {
  let finalBatchSize
  let finalRetries
  let finalTimeout
  const finalUrls = typeof body === 'string' ? body.split('\n').filter(url => url) : undefined
  if (!(finalUrls instanceof Array && finalUrls.length > 0)) throw new BadRequest(`body is invalid`)
  if (batchSize) {
    finalBatchSize = +batchSize
    validateInt({ value: finalBatchSize, min: 1, max: maxBulkImport, message: 'batchSize parameter is invalid' })
  }
  if (retries) {
    finalRetries = +retries
    validateInt({ value: finalRetries, min: 0, max: maxRetries, message: 'retries parameter is invalid' })
  }
  if (timeout) {
    finalTimeout = +timeout
    validateInt({ value: finalTimeout, min: 500, max: maxTimeout, message: 'timeout parameter is invalid' })
  }
  return {
    urls: finalUrls,
    batchSize: finalBatchSize,
    retries: finalRetries,
    timeout: finalTimeout,
  }
}

exports.imports = handleReq(async (req, res) => {
  const params = sanitizeBulkImport(req)
  const job = await importBulk(params)
  res.status(201).json(job)
})
