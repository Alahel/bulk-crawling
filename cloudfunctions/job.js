const { BadRequest } = require('http-errors')
const { getJob } = require('./common')
const { handleReq } = require('./helpers')

exports.job = handleReq(async ({ query: { id } }, res) => {
  if (!id) throw new BadRequest(`id parameter is required`)
  return res.json(await getJob(id))
})
