const { BadRequest } = require('http-errors')

const handleReq = prom => async (req, res, next) => {
  try {
    await prom(req, res, next)
  } catch (e) {
    console.error(e)
    res.status(e.statusCode || e.status || 500).json([e.message])
  }
}

const deserialize = ({ data }) => JSON.parse(Buffer.from(data, 'base64').toString())

const serialize = message => Buffer.from(JSON.stringify(message), 'utf8')

const serializeDate = date => (date instanceof Date ? date.toISOString() : null)

const validateInt = ({ value, min = 0, max, message }) => {
  if (!(!Number.isNaN(value) && value >= min && value <= max)) throw new BadRequest(message)
}

const watchKO = async prom => {
  try {
    await prom()
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
}

module.exports = { handleReq, deserialize, serialize, serializeDate, validateInt, watchKO }
