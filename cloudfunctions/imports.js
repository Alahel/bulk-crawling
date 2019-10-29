const { importBulk } = require('./business')
const { sanitizeBulkImport } = require('./sanitize')
const { handle } = require('./helpers')

exports.imports = handle(async (req, res) => {
  console.log('-----received imports')
  const params = sanitizeBulkImport(req)
  const job = await importBulk(params)
  res.status(201).json(job)
})
