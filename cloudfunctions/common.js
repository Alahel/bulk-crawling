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
  // filter in-memory documents as Firestore does not provide a way to directly count
  const baseQuery = crawlResultsColl.where('jobId', '==', jobId)
  const [completedDocs, errorsDocs, startedAtDocs, lastProcessedAtDocs] = await Promise.all([
    baseQuery.where('status', '==', IMPORT_STATUS_COMPLETED).get(),
    baseQuery.where('status', '==', IMPORT_STATUS_ERROR).get(),
    baseQuery
      .orderBy('at', 'asc')
      .limit(1)
      .get(),
    baseQuery
      .orderBy('at', 'desc')
      .limit(1)
      .get(),
  ])
  const startedAt = startedAtDocs.docs[0].at
  const lastProcessedAt = lastProcessedAtDocs.docs[0].at
  const processed = completedDocs.size
  const errors = errorsDocs.size
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
