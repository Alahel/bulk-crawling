const chunk = require('lodash/chunk')
const { PubSub } = require('@google-cloud/pubsub')
const uuid = require('uuidv4').default
const URLSlugify = require('url-slugify')
const Crawler = require('crawler')
const { NotFound } = require('http-errors')
const { topic, crawlSingleTimeout } = require('./config')
const { serialize, deserialize, serializeDate } = require('./helpers')

const IMPORT_STATUS_PENDING = 'pending'
const IMPORT_STATUS_RUNNING = 'running'
const IMPORT_STATUS_COMPLETED = 'completed'
const MAX_FILE_NAME_LENGTH = 255

const pubsub = new PubSub()
const pubsubTopic = pubsub.topic(topic)
const urlSlugify = new URLSlugify()
const jobsStats = new Map()

const crawl = ({ event }) => {
  const batchPayload = deserialize(event)
  console.info(batchPayload)
  const {
    jobId,
    batch: { urls },
  } = batchPayload
  const crawler = new Crawler({
    maxConnections: 300,
    retries: 0,
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
      console.log('----crawl finished', fileName)
      const jobStat = jobsStats.get(jobId)
      if (error) {
        // todo: handle errors
        jobStat.set('errors', (jobStat.get('errors') || 0) + 1)
        return done(error)
      }
      jobStat.set('processed', (jobStat.get('processed') || 0) + 1)
      jobStat.set('lastProcessedAt', new Date())
      done()
    },
  })
  crawler.on('schedule', ({ batchPayload: { jobId } }) => {
    jobsStats.get(jobId).set('status', IMPORT_STATUS_RUNNING)
  })
  crawler.on('request', ({ batchPayload: { jobId } }) => {
    const jobStat = jobsStats.get(jobId)
    if (!jobStat.get('startedAt')) jobStat.set('startedAt', new Date())
  })
  urls.forEach(url =>
    crawler.queue({
      uri: url,
      jQuery: false,
      retries: 0,
      batchResult: {
        fileName: urlSlugify.slugify(url).slice(0, MAX_FILE_NAME_LENGTH),
      },
      batchPayload,
    }),
  )
}

const getJob = id => {
  const job = jobsStats.get(id)
  if (!job) throw new NotFound(`job does not exists`)
  const processed = job.get('processed')
  const total = job.get('total')
  const errors = job.get('errors')
  const queuedAt = job.get('queuedAt')
  const startedAt = job.get('startedAt')
  const lastProcessedAt = job.get('lastProcessedAt')
  let endedAt
  let status = job.get('status')
  let duration = null
  const errorRate = `${Math.ceil((errors * 100) / total)}%`
  if (processed + errors >= total) {
    status = IMPORT_STATUS_COMPLETED
  }
  if (status === IMPORT_STATUS_RUNNING) {
    duration = new Date() - startedAt
  }
  if (status === IMPORT_STATUS_COMPLETED) {
    endedAt = lastProcessedAt
    duration = endedAt - startedAt
  }
  return {
    jobId: id,
    total,
    processed,
    errors,
    status,
    errorRate,
    queuedAt: serializeDate(queuedAt),
    startedAt: serializeDate(startedAt),
    lastProcessedAt: serializeDate(lastProcessedAt),
    endedAt: serializeDate(endedAt),
    duration: `${Math.ceil(duration / 1000)}s`,
  }
}

const importBulk = async ({ urls, batchSize = 1 }) => {
  // process job
  const jobId = uuid()
  jobsStats.clear()
  jobsStats.set(
    jobId,
    new Map([
      ['status', IMPORT_STATUS_PENDING],
      ['processed', 0],
      ['total', urls.length],
      ['errors', 0],
      ['queuedAt', new Date()],
      ['startedAt', undefined],
      ['lastProcessedAt', undefined],
    ]),
  )
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
