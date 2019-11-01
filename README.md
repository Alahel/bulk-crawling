# bulk-crawling

Exercise to compare massive crawling using GCP cloud functions vs GCP Kubernetes

## nodejs

A first prototype for the others solution, based on NodeJS + express

Bootstrap: `make nodejs-bootstrap`

Run the application, dev: `make nodejs-dev`

Run the application, prod: `make nodejs`

## cloudfunctions

Bootstrap: `gcloud pubsub topics create crawl_batches`

Add a `config/sa.json` for the service account key in charge of IAM accesses (PubSub, BigQuery, CloudFunctions, Bucket)

Deploy for dev/tests: `make cf-deploy-parallel`
Deploy for speed: `CF_ARGS='--memory 2048MB' make cf-deploy-parallel`

### imports

Entry-point of import jobs, POST a body with all the required urls to crawl.

Provide a `batchSize` GET parameter to fine-tune the number of urls sent to each cloud function.

Provide a `retries` GET parameter to fine-tune the number of retries per crawled sites

Provide a `timeout` GET parameter to fine-tune the maximum timeout when crawling not responding sites

Deploy for dev/tests: `make cf-deploy-imports`
Deploy for speed: `CF_ARGS='--memory 2048MB' cf-deploy-imports`

### job

Get the status of the import job. Provide a `:id` GET parameter to retrieve metadata about this import.

Ex: `/job?id=5bb6f388-9483-48c7-9c85-ce3858e3e182`

Deploy for dev/tests: `make cf-deploy-job`
Deploy for speed: `CF_ARGS='--memory 2048MB' cf-deploy-job`

### crawl

Background cloud function. Crawls one or several urls from a pubsub, then uploads the result
to a bucket.

Deploy for dev/tests: `make cf-deploy-crawl`
Deploy for speed: `CF_ARGS='--memory 2048MB' cf-deploy-crawl`

### crawlResult

Background cloud function. Register statistics about the crawling results in the Datastore.

Deploy for dev/tests: `make cf-deploy-crawlResults`
Deploy for speed: `CF_ARGS='--memory 2048MB' cf-deploy-crawlResults`
