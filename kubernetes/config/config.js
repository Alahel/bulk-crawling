const { SERVER_PORT } = process.env

module.exports = {
  port: SERVER_PORT || 8080,
  maxFileSize: '10mb',
  maxBulkImport: 10000,
  maxRetries: 5,
  maxTimeout: 30000,
  projectId: 'bulk-crawling-kb',
  bqDatasetName: 'bulkCrawlingResults',
  batchesTopic: 'crawl_batches',
  batchesResultsTopic: 'crawl_batches_statuses',
  bucketName: 'crawl-jobs-results-kb',
}
