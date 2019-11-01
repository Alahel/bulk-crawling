module.exports = {
  maxBulkImport: 10000,
  maxRetries: 5,
  maxTimeout: 30000,
  projectId: 'bulk-crawling',
  bqDatasetName: 'bulkCrawlingResults',
  batchesTopic: 'crawl_batches',
  batchesResultsTopic: 'crawl_batches_statuses',
  bucketName: 'crawl-jobs-results',
}
