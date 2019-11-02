const {
  pubsub,
  bootstrapSubscription,
  bootstrapHealthCheckServer,
  bigquery,
  crawlingResultsTableRef,
} = require('./common')
const { batchesResultsTopic, maxMessagesPerSubscription, batchesResultsSubscriptionName } = require('./config/config')
const { deserialize } = require('./helpers')

const crawlResult = async ({ event }) => {
  const { jobId, status, url, at } = deserialize(event)
  await crawlingResultsTableRef.insert({
    jobId,
    status,
    url,
    at: bigquery.datetime(at),
  })
}

const messageHandler = async message => {
  console.log(`Received message: ${message.id}`)
  console.log(`\tData: ${message.data}`)
  console.log(`\tAttributes: ${message.attributes}`)
  await crawlResult({ event: message.data })
  message.ack()
}

const bootstrap = async () => {
  const pubsubTopic = await bootstrapSubscription({
    topicName: batchesResultsTopic,
    subscriptionName: batchesResultsSubscriptionName,
  })
  const subscriberOptions = {
    flowControl: {
      maxMessages: maxMessagesPerSubscription,
    },
  }
  const subscription = pubsub.subscription(batchesResultsSubscriptionName, subscriberOptions)
  subscription.on(`message`, messageHandler)
  console.log(`subscription ${batchesResultsSubscriptionName} for ${pubsubTopic.name} registered`)
  bootstrapHealthCheckServer()
}
bootstrap()
