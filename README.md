# bulk-crawling

Exercise to compare massive crawling using GCP cloud functions vs GCP Kubernetes

## nodejs

Bootstrap: `cd nodejs && npm i`

Run the application, dev: `npm run dev`

Run the application, prod: `npm start`

## cloudfunctions

Bootstrap: `gcloud pubsub topics create crawl_batches`

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

Deploy: `gcloud functions deploy imports --runtime nodejs10 --trigger-http --max-instances 1`

### job

Get the status of the import job. Provide a `:id` GET parameter to retrieve metadata about this import.

Deploy: `gcloud functions deploy job --runtime nodejs10 --trigger-http --max-instances 3`

### crawl

Background cloud function. Crawls one or several urls from a pubsub, then uploads the the result
to a bucket.

Deploy: `gcloud functions deploy crawl --runtime nodejs10 --trigger-topic crawl_batches --max-instances 100`
