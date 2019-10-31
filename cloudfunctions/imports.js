const chunk = require('lodash/chunk')
const uuid = require('uuidv4').default
const { BadRequest } = require('http-errors')
const { getJobDoc, getJob } = require('./common')
const { handle } = require('./helpers')
const { PubSub } = require('@google-cloud/pubsub')
const { serialize } = require('./helpers')
const { topic, maxBulkImport, maxRetries, maxTimeout } = require('./config/config')

const pubsub = new PubSub()
const pubsubTopic = pubsub.topic(topic)

const importBulk = async ({ urls, batchSize = 1, retries = 0, timeout = 1000 }) => {
  const jobId = uuid()
  const { jobRef } = await getJobDoc(jobId)
  await jobRef.set({
    jobId,
    options: {
      batchSize,
      retries,
      timeout,
    },
    total: urls.length,
    queuedAt: new Date().toISOString(),
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
  // Send async job for proper processing
  Promise.all(batchesProms)
  return getJob(jobId)
}

const validateInt = ({ value, min = 0, max, message }) => {
  if (!(!Number.isNaN(value) && value >= min && value <= max)) throw new BadRequest(message)
}

const sanitizeBulkImport = ({ query: { batchSize, retries, timeout }, body }) => {
  let finalBatchSize
  let finalRetries
  let finalTimeout
  const finalUrls = typeof body === 'string' ? body.split('\n') : undefined
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

exports.imports = handle(async (req, res) => {
  const params = sanitizeBulkImport(req)
  const job = await importBulk(params)
  res.status(201).json(job)
})
