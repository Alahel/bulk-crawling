const Crawler = require('crawler')
const URLSlugify = require('url-slugify')
const { IMPORT_STATUS_COMPLETED, IMPORT_STATUS_ERROR } = require('./constants')
const { PubSub } = require('@google-cloud/pubsub')
const { resultsTopic, bucketName } = require('./config/config')
const { serialize, deserialize } = require('./helpers')
const { Storage } = require('@google-cloud/storage')

const MAX_FILE_NAME_LENGTH = 255
const CRAWL_OPTIONS = {
  jQuery: false,
  retries: 0,
  retryTimeout: 1000,
  maxConnections: 300,
  timeout: 5000,
  encoding: null,
}

const pubsub = new PubSub()
const gcs = new Storage()
const pubsubResultsTopic = pubsub.topic(resultsTopic)
const urlSlugify = new URLSlugify()

const uploadDocument = async ({ fileName, jobId, document }) => {
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
      batch: { urls, retries, timeout },
    } = batchPayload
    const crawler = new Crawler({
      ...CRAWL_OPTIONS,
      retries,
      timeout,
      callback: async (error, res, done) => {
        const {
          body,
          options: {
            uri: url,
            batchPayload: { jobId },
            batchResult: { fileName },
          },
        } = res
        const messPayload = {
          jobId,
          url,
        }
        if (error) {
          await pubsubResultsTopic.publish(
            serialize({
              ...messPayload,
              status: IMPORT_STATUS_ERROR,
              at: new Date(),
            }),
          )
          return done(error)
        } else {
          await uploadDocument({ fileName, jobId, document: body })
          await pubsubResultsTopic.publish(
            serialize({
              ...messPayload,
              status: IMPORT_STATUS_COMPLETED,
              at: new Date(),
            }),
          )
        }
        done()
      },
    })
    crawler.on('drain', async () => {
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

exports.crawl = async (event, context) => {
  await crawl({ event, context })
}
