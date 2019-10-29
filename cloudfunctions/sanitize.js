const { BadRequest } = require('http-errors')
const { maxBulkImport } = require('./config')

const sanitizeBulkImport = ({ query: { batchSize }, body }) => {
  let finalBatchSize
  const finalUrls = typeof body === 'string' ? body.split('\n') : undefined
  if (batchSize) {
    finalBatchSize = +batchSize
    if (
      !(
        !Number.isNaN(finalBatchSize) &&
        finalBatchSize > 0 &&
        finalBatchSize <= maxBulkImport
      )
    )
      throw new BadRequest(`batchSize parameter is invalid`)
  }
  if (!(finalUrls instanceof Array && finalUrls.length > 0))
    throw new BadRequest(`body is invalid`)
  return {
    urls: finalUrls,
    batchSize: finalBatchSize,
  }
}

module.exports = {
  sanitizeBulkImport,
}
