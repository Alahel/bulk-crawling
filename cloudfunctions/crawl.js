const Crawler = require('crawler')
const URLSlugify = require('url-slugify')
const { batchesResultsTopic, bucketName } = require('./config/config')
const { IMPORT_STATUS_COMPLETED, IMPORT_STATUS_ERROR } = require('./constants')
const { pubsub, gcs } = require('./common')
const { serialize, deserialize, serializeDate } = require('./helpers')

const MAX_FILE_NAME_LENGTH = 255
const CRAWL_OPTIONS = {
  jQuery: false,
  maxConnections: 300,
  encoding: null,
}
const pubsubResultsTopic = pubsub.topic(batchesResultsTopic)
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
      retryTimeout: timeout,
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
              at: serializeDate(new Date()),
            }),
          )
          return done(error)
        }
        await uploadDocument({ fileName, jobId, document: body })
        await pubsubResultsTopic.publish(
          serialize({
            ...messPayload,
            status: IMPORT_STATUS_COMPLETED,
            at: serializeDate(new Date()),
          }),
        )
        done()
      },
    })
    crawler.on('drain', () => resolve())
    // Crawl in parallel for each url of the batches
    urls.forEach(url =>
      crawler.queue({
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
