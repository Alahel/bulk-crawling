const Crawler = require('crawler')
const URLSlugify = require('url-slugify')
const { batchesResultsTopic, bucketName } = require('./config/config')
const { batchesTopic, batchesSubscriptionName } = require('./config/config')
const { gcs, pubsub, bootstrapSubscription, bootstrapHealthCheckServer } = require('./common')
const { IMPORT_STATUS_COMPLETED, IMPORT_STATUS_ERROR } = require('./constants')
const { serialize, deserialize, watchKO } = require('./helpers')

const MAX_FILE_NAME_LENGTH = 255
const CRAWL_OPTIONS = {
  jQuery: false,
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

const crawler = new Crawler({
  ...CRAWL_OPTIONS,
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
    }
    await uploadDocument({ fileName, jobId, document: body })
    await pubsubResultsTopic.publish(
      serialize({
        ...messPayload,
        status: IMPORT_STATUS_COMPLETED,
        at: new Date(),
      }),
    )
    done()
  },
})

const crawl = ({ event }) => {
  const batchPayload = deserialize(event)
  const {
    batch: { urls, retries, timeout },
  } = batchPayload
  // Crawl in parallel for each url of the batches
  urls.forEach(url =>
    crawler.queue({
      uri: url,
      retries,
      timeout,
      retryTimeout: timeout,
      batchResult: {
        fileName: urlSlugify.slugify(url).slice(0, MAX_FILE_NAME_LENGTH),
      },
      batchPayload,
    }),
  )
}

const messageHandler = async message => {
  message.ack()
  console.log(`received crawl message ${message.id}`)
  crawl({ event: message })
}

const bootstrap = async () => {
  const subscriptionName = `${batchesSubscriptionName}`
  bootstrapHealthCheckServer()
  const { topic: pubsubTopic, subscription } = await bootstrapSubscription({
    topicName: batchesTopic,
    subscriptionName,
  })
  subscription.on('message', messageHandler)
  console.log(`subscription ${subscriptionName} for ${pubsubTopic.name} registered`)
}
watchKO(bootstrap)
