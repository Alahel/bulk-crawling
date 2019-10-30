const { BadRequest } = require('http-errors')
const { getJob } = require('./business')
const { handle } = require('./helpers')

exports.job = handle(async ({ query: { id } }, res) => {
  if (!id) throw new BadRequest(`id parameter is required`)
  res.json(await getJob(id))
})
