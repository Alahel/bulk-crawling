const handle = prom => async (req, res, next) => {
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

module.exports = { handle, deserialize, serialize, serializeDate }
