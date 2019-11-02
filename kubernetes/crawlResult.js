const { batchesResultsTopic, batchesResultsSubscriptionName } = require('./config/config')
const { bootstrapSubscription, bootstrapHealthCheckServer, bigquery, crawlingResultsTableRef } = require('./common')
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
  message.ack()
  console.log(`received message ${message.id}`)
  await crawlResult({ event: message })
}

const bootstrap = async () => {
  const subscriptionName = `${batchesResultsSubscriptionName}`
  bootstrapHealthCheckServer()
  const { topic: pubsubTopic, subscription } = await bootstrapSubscription({
    topicName: batchesResultsTopic,
    subscriptionName,
  })
  subscription.on(`message`, messageHandler)
  console.log(`subscription ${batchesResultsSubscriptionName} for ${pubsubTopic.name} registered`)
}
bootstrap()
