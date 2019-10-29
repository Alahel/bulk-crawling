const { SERVER_PORT } = process.env

module.exports = {
  port: SERVER_PORT || 8080,
  maxFileSize: '100mb',
  maxBulkImport: 10000,
}
