const bodyParser = require('body-parser')
const cors = require('cors')
const express = require('express')
const { getJob, importBulk } = require('./business')
const { port, maxFileSize } = require('./config')
const { sanitizeBulkImport } = require('./sanitize')

const handle = prom => async (req, res, next) => {
  try {
    await prom(req, res, next)
  } catch (e) {
    console.error(e)
    res.status(e.statusCode || e.status || 500).json([e.message])
  }
}

const app = express()
app.use(
  bodyParser.text({
    limit: maxFileSize,
  }),
)

app.use(cors())

app.get('/health', (req, res) => res.sendStatus(200))

app.post(
  '/imports',
  handle(async (req, res) => {
    const params = sanitizeBulkImport(req)
    const job = await importBulk(params)
    res.status(201).json(job)
  }),
)

app.get(
  ['/job/:id', '/job'],
  handle(async ({ params: { id }, query: { id: qId } }, res) => res.json(getJob(id || qId))),
)

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => res.sendStatus(err ? 500 : 404))
app.listen(port, () => {
  console.log(`Server listening on ${port}`)
})
