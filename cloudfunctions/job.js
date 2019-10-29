const { getJob } = require('./business')
const { handle } = require('./helpers')

exports.job = handle(async ({ params: { id } }, res) => res.json(getJob(id)))
