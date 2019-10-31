const { BadRequest } = require('http-errors')
const { getJob } = require('./common')
const { handle } = require('./helpers')

exports.job = handle(async ({ query: { id } }, res) => {
  if (!id) throw new BadRequest(`id parameter is required`)
  return res.json(await getJob(id))
})
