const chunk = require('lodash/chunk')
const Crawler = require('crawler')
const Firestore = require('@google-cloud/firestore')
const path = require('path')
const URLSlugify = require('url-slugify')
const uuid = require('uuidv4').default
const { NotFound } = require('http-errors')
const { PubSub } = require('@google-cloud/pubsub')
const { serialize, deserialize, serializeDate } = require('./helpers')
const { Storage } = require('@google-cloud/storage')
const { topic, crawlSingleTimeout, bucketName } = require('./config')

const IMPORT_STATUS_PENDING = 'pending'
const IMPORT_STATUS_RUNNING = 'running'
const IMPORT_STATUS_COMPLETED = 'completed'
const MAX_FILE_NAME_LENGTH = 255
const CRAWL_OPTIONS = {
  jQuery: false,
  retries: 0,
}

const pubsub = new PubSub()
const pubsubTopic = pubsub.topic(topic)
const urlSlugify = new URLSlugify()
const db = new Firestore({
  projectId: 'bulk-crawling',
  keyFilename: path.join('.', 'config', 'bulk-crawling-9cb53074d6f4.json'),
})
let gcs

const getJobDoc = async jobId => {
  const jobRef = db.collection('jobs').doc(jobId)
  const jobDoc = await jobRef.get()
  let job
  if (jobDoc.exists) job = jobDoc.data()
  return {
    jobRef,
    jobDoc,
    job,
  }
}

const uploadDocument = async ({ fileName, jobId, document }) => {
  gcs = gcs || new Storage()
  const bucket = gcs.bucket(bucketName)
  const file = bucket.file(`${jobId}/${fileName}`)
  await file.save(document, {
    resumable: false,
    gzip: true,
    metadata: {
      contentType: 'text/plain',
    },
  })
}

const crawl = ({ event }) =>
  new Promise(resolve => {
    const batchPayload = deserialize(event)
    const {
      batch: { urls },
    } = batchPayload
    const crawler = new Crawler({
      ...CRAWL_OPTIONS,
      maxConnections: 300,
      timeout: crawlSingleTimeout,
      retryTimeout: 1000,
      encoding: null,
      callback: async (error, res, done) => {
        const {
          body,
          options: {
            batchPayload: { jobId },
            batchResult: { fileName },
          },
        } = res
        const { jobRef, job } = await getJobDoc(jobId)
        if (error) {
          job.errors = (+job.errors || 0) + 1
        } else {
          job.processed = (job.processed || 0) + 1
          job.lastProcessedAt = new Date()
        }
        await jobRef.update(job)
        if (error) {
          return done(error)
        }
        await uploadDocument({ fileName, jobId, document: body })
        done()
      },
    })
    crawler.on('schedule', async ({ batchPayload: { jobId } }) => {
      const { jobRef, job } = await getJobDoc(jobId)
      if (job.status === IMPORT_STATUS_PENDING) {
        job.status = IMPORT_STATUS_RUNNING
        await jobRef.update(job)
      }
    })
    crawler.on('request', async ({ batchPayload: { jobId } }) => {
      const { jobRef, job } = await getJobDoc(jobId)
      if (!job.startedAt) {
        job.startedAt = new Date()
        await jobRef.update(job)
      }
    })
    crawler.on('drain', () => {
      resolve()
    })
    urls.forEach(url =>
      crawler.queue({
        ...CRAWL_OPTIONS,
        uri: url,
        batchResult: {
          fileName: urlSlugify.slugify(url).slice(0, MAX_FILE_NAME_LENGTH),
        },
        batchPayload,
      }),
    )
  })

const getJob = async jobId => {
  const { job } = await getJobDoc(jobId)
  if (!job) throw new NotFound(`job does not exists`)
  const { processed, total, errors, queuedAt, startedAt, lastProcessedAt, options } = job
  let { status } = job
  let endedAt
  let duration = null
  let throughput = null
  const totalProcessed = processed + errors
  const errorRate = totalProcessed > 0 ? `${Math.ceil((errors * 100) / total)}%` : null
  if (totalProcessed >= total) {
    status = IMPORT_STATUS_COMPLETED
  }
  if (status === IMPORT_STATUS_RUNNING && startedAt) {
    duration = new Date() - startedAt
  }
  if (status === IMPORT_STATUS_COMPLETED && startedAt) {
    endedAt = lastProcessedAt
    duration = endedAt - startedAt
  }
  if (duration > 0) {
    throughput = totalProcessed / duration
  }
  return {
    jobId,
    options,
    total,
    processed,
    errors,
    status,
    errorRate,
    throughput: throughput ? `${Number(throughput * 1000).toFixed(2)}/s` : null,
    queuedAt: serializeDate(queuedAt),
    startedAt: serializeDate(startedAt),
    lastProcessedAt: serializeDate(lastProcessedAt),
    endedAt: serializeDate(endedAt),
    duration: duration ? `${Math.ceil(duration / 1000)}s` : null,
  }
}

const importBulk = async ({ urls, batchSize = 1 }) => {
  // process job
  const jobId = uuid()
  const { jobRef } = await getJobDoc(jobId)
  await jobRef.set({
    jobId,
    options: {
      batchSize,
    },
    status: IMPORT_STATUS_PENDING,
    processed: 0,
    total: urls.length,
    errors: 0,
    queuedAt: new Date(),
    startedAt: null,
    lastProcessedAt: null,
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
        },
      }),
    ),
  )
  // Send async job for proper processing
  Promise.all(batchesProms)
  return getJob(jobId)
}

module.exports = {
  getJob,
  importBulk,
  crawl,
}
