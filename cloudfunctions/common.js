const Firestore = require('@google-cloud/firestore')
const path = require('path')
const {
  IMPORT_STATUS_RUNNING,
  IMPORT_STATUS_COMPLETED,
  IMPORT_STATUS_ERROR,
  IMPORT_STATUS_PENDING,
} = require('./constants')
const { NotFound } = require('http-errors')
const { serializeDate } = require('./helpers')

const db = new Firestore({
  projectId: 'bulk-crawling',
  keyFilename: path.join('.', 'config', 'firestore_sa.json'),
})
const jobsColl = db.collection('jobs')
const crawlResultsColl = db.collection('crawl_results')

const getJobDoc = async jobId => {
  const jobRef = jobsColl.doc(jobId)
  const jobDoc = await jobRef.get()
  let job
  if (jobDoc.exists) job = jobDoc.data()
  return {
    jobRef,
    jobDoc,
    job,
  }
}

const getJob = async jobId => {
  const { job } = await getJobDoc(jobId)
  if (!job) throw new NotFound(`job does not exists`)
  const { options, total, queuedAt } = job
  const parsedQueuedAt = queuedAt ? new Date(queuedAt) : undefined
  // filter in-memory documents as Firestore does not provide a way to count
  const { docs: items = [] } = await crawlResultsColl.where('jobId', '==', jobId).get()
  const { processed, errors, startedAt, lastProcessedAt } = items.reduce(
    (acc, item) => {
      const { status, at } = item.data()
      const parsedAt = new Date(at)
      const { startedAt: prevStartedAt, lastProcessedAt: prevLastProcessedAt } = acc
      if (status === IMPORT_STATUS_COMPLETED) acc.processed += 1
      if (status === IMPORT_STATUS_ERROR) acc.errors += 1
      if (!prevStartedAt) acc.startedAt = parsedAt
      if (!prevLastProcessedAt) acc.lastProcessedAt = parsedAt
      if (parsedAt < prevStartedAt) acc.startedAt = parsedAt
      if (parsedAt > prevLastProcessedAt) acc.lastProcessedAt = parsedAt
      return acc
    },
    {
      total: 0,
      processed: 0,
      errors: 0,
      startedAt: null,
      lastProcessedAt: null,
    },
  )
  let endedAt
  let duration = null
  let throughput = null
  const totalProcessed = processed + errors
  let status = totalProcessed > 0 ? IMPORT_STATUS_RUNNING : IMPORT_STATUS_PENDING
  const errorRate = totalProcessed > 0 ? `${Math.ceil((errors * 100) / total)}%` : null
  if (totalProcessed >= total) status = IMPORT_STATUS_COMPLETED
  if (status === IMPORT_STATUS_RUNNING && startedAt) duration = new Date() - startedAt
  if (status === IMPORT_STATUS_COMPLETED && startedAt) {
    endedAt = lastProcessedAt
    duration = endedAt - startedAt
  }
  if (duration > 0) throughput = totalProcessed / duration
  return {
    jobId,
    options,
    total,
    processed,
    errors,
    status,
    errorRate,
    throughput: throughput ? `${Number(throughput * 1000).toFixed(2)}/s` : null,
    queuedAt: serializeDate(parsedQueuedAt),
    startedAt: serializeDate(startedAt),
    lastProcessedAt: serializeDate(lastProcessedAt),
    endedAt: serializeDate(endedAt),
    duration: duration ? `${Math.ceil(duration / 1000)}s` : null,
  }
}

module.exports = {
  db,
  jobsColl,
  crawlResultsColl,
  getJobDoc,
  getJob,
}
