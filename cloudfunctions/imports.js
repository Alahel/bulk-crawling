const { handle } = require('./helpers')
const { importBulk } = require('./business')
const { sanitizeBulkImport } = require('./sanitize')

exports.imports = handle(async (req, res) => {
  const params = sanitizeBulkImport(req)
  const job = await importBulk(params)
  res.status(201).json(job)
})
