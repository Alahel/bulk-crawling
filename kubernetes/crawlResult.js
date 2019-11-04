const { batchesResultsTopic, batchesResultsSubscriptionName } = require('./config/config')
const { bootstrapSubscription, bootstrapHealthCheckServer, crawlingResultsTableRef } = require('./common')
const { deserialize, watchKO } = require('./helpers')

const crawlResult = async ({ event }) => {
  const { jobId, status, url, at } = deserialize(event)
  await crawlingResultsTableRef.insert({
    jobId,
    status,
    url,
    at,
  })
}

const messageHandler = async message => {
  await crawlResult({ event: message })
  message.ack()
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
watchKO(bootstrap)
