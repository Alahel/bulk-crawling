const { SERVER_PORT } = process.env

module.exports = {
  port: SERVER_PORT || 8080,
  maxFileSize: '10mb',
  maxBulkImport: 10000,
  maxRetries: 5,
  maxTimeout: 30000,
  maxMessagesPerSubscription: 1000,
  batchesSubscriptionName: 'crawl_batches_subscription',
  batchesResultsSubscriptionName: 'crawl_batches_statuses_subscription',
  projectId: 'bulk-crawling-kb',
  bqDatasetName: 'bulkCrawlingResults',
  batchesTopic: 'crawl_batches',
  batchesResultsTopic: 'crawl_batches_statuses',
  bucketName: 'crawl-jobs-results-kb',
}
