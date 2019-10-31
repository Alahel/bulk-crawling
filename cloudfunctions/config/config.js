module.exports = {
  maxBulkImport: 10000,
  maxRetries: 5,
  maxTimeout: 30000,
  topic: 'crawl_batches',
  resultsTopic: 'crawl_batches_statuses',
  bucketName: 'crawl-jobs-results',
}
