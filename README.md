# bulk-crawling

Exercise to compare massive crawling using GCP cloud functions vs GCP Kubernetes

## nodejs

A first prototype for the others solution, based on NodeJS + express

Bootstrap: `cd nodejs && npm i`

Run the application, dev: `npm run dev`

Run the application, prod: `npm start`

## cloudfunctions

Bootstrap: `gcloud pubsub topics create crawl_batches`

Add a `config/firestore_sa.json` for the service account key in charge of Firestore access

Starting the emulator for the pubsub: `gcloud beta emulators pubsub start`

```
export PUBSUB_EMULATOR_HOST=localhost:8085
export PUBSUB_PROJECT_ID=bulk-crawling
```

```
python publisher.py bulk-crawling create crawl_batches
python subscriber.py bulk-crawling create crawl_batches crawl_sub
python subscriber.py bulk-crawling create-push crawl_batches crawl_sub http://localhost:8083

unset PUBSUB_EMULATOR_HOST
```

### imports

Entry-point of import jobs, POST a body with all the required urls to crawl.

Provide a `batchSize` GET parameter to fine-tune the number of urls sent to each cloud function.

Provide a `retries` GET parameter to fine-tune the number of retries per crawled sites

Provide a `timeout` GET parameter to fine-tune the maximum timeout when crawling not responding sites

Deploy: `gcloud functions deploy imports --runtime nodejs10 --trigger-http --max-instances 1 --memory 2048MB`

### job

Get the status of the import job. Provide a `:id` GET parameter to retrieve metadata about this import.

Deploy: `gcloud functions deploy job --runtime nodejs10 --trigger-http --max-instances 1 --memory 2048MB`

### crawl

Background cloud function. Crawls one or several urls from a pubsub, then uploads the result
to a bucket.

Deploy: `gcloud functions deploy crawl --runtime nodejs10 --trigger-topic crawl_batches --max-instances 1000 --memory 2048MB`

### crawlResult

Background cloud function. Register statistics about the crawling results in the Datastore.

Deploy: `gcloud functions deploy crawlResult --runtime nodejs10 --trigger-topic crawl_batches_statuses --max-instances 1000 --memory 2048MB`
