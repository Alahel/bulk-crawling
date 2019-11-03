const bodyParser = require('body-parser')
const chunk = require('lodash/chunk')
const cors = require('cors')
const express = require('express')
const uuid = require('uuidv4').default
const { BadRequest } = require('http-errors')
const { handleReq, serialize, validateInt, serializeDate } = require('./helpers')
const { port, maxFileSize, batchesTopic, maxBulkImport, maxRetries, maxTimeout } = require('./config/config')
const { pubsub, bootstrapDeps, jobsTableRef, getJob, addHealthCheck } = require('./common')

const pubsubTopic = pubsub.topic(batchesTopic)

const importBulk = async ({ urls, batchSize = 1, retries = 1, timeout = 3000 }) => {
  const jobId = uuid()
  try {
    await jobsTableRef.insert({
      jobId,
      options: JSON.stringify({
        batchSize,
        retries,
        timeout,
      }),
      total: urls.length,
      queuedAt: serializeDate(new Date()),
    })
  } catch (e) {
    console.error(JSON.stringify(e.response))
  }
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

const app = express()
app.use(
  bodyParser.text({
    limit: maxFileSize,
  }),
)
app.use(cors())

addHealthCheck(app)

app.get(
  ['/job/:id', '/job'],
  handleReq(async ({ params: { id }, query: { id: qId } }, res) => {
    const finalId = id || qId
    if (!finalId) throw new BadRequest(`id parameter is required`)
    const job = await getJob(finalId)
    return res.json(job)
  }),
)

app.post(
  '/imports',
  handleReq(async (req, res) => {
    const params = sanitizeBulkImport(req)
    const job = await importBulk(params)
    return res.status(201).json(job)
  }),
)

app.post(
  '/init',
  handleReq(async (req, res) => {
    await bootstrapDeps()
    return res.json({ success: true })
  }),
)

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => res.sendStatus(err ? 500 : 404))
app.listen(port, () => {
  console.log(`Server listening on ${port}`)
})
