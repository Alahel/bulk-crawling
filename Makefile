# --------- cloudfunctions
# CF_ARGS='--memory 2048mb' for better performance on cloudfunctions
export CF_ARGS?=--memory 256mb

define cfDeploy
	cd cloudfunctions && gcloud functions deploy $(1)
endef

.PHONY: cf-deploy-imports
cf-deploy-imports:
	$(call cfDeploy,imports --runtime nodejs10 --trigger-http --max-instances 1 $$CF_ARGS)

.PHONY: cf-deploy-job
cf-deploy-job:
	$(call cfDeploy,job --runtime nodejs10 --trigger-http --max-instances 1 $$CF_ARGS)

.PHONY: cf-deploy-crawl
cf-deploy-crawl:
	$(call cfDeploy,crawl --runtime nodejs10 --trigger-topic crawl_batches --max-instances 1000000 $$CF_ARGS)

.PHONY: cf-deploy-crawlResult
cf-deploy-crawlResult:
	$(call cfDeploy,crawlResult --runtime nodejs10 --trigger-topic crawl_batches_statuses --max-instances 1000000 $$CF_ARGS)

.PHONY: cf-deploy
cf-deploy: cf-deploy-imports cf-deploy-job cf-deploy-crawl cf-deploy-crawlResult

.PHONY: cf-deploy-parallel
cf-deploy-parallel:
	$(MAKE) cf-deploy -j4

# --------- nodejs prototype
.PHONY: nodejs-bootstrap
nodejs-bootstrap:
	cd nodejs && npm i

.PHONY: nodejs-dev
nodejs-dev:
	cd nodejs && npm run dev

.PHONY: nodejs
nodejs:
	cd nodejs && npm start

# --------- kubernetes
export KB_ROOT_CMD=cd kubernetes

.PHONY: kb-dev-up
kb-dev-up:
	$$KB_ROOT_CMD && docker-compose up --build -d

.PHONY: kb-dev-down
kb-dev-down:
	$$KB_ROOT_CMD && docker-compose down --remove-orphans

.PHONY: kb-dev-down-up
kb-dev-down-up: kb-dev-down kb-dev-up

.PHONY: kb-build-orchestrator
kb-build-orchestrator:
	$$KB_ROOT_CMD && docker build -f ./docker/orchestrator/Dockerfile -t gcr.io/bulk-crawling-kb/kb-orchestrator:latest . \
	&& docker push gcr.io/bulk-crawling-kb/kb-orchestrator:latest

.PHONY: kb-build-crawl
kb-build-crawl:
	$$KB_ROOT_CMD && docker build -f ./docker/crawl/Dockerfile -t gcr.io/bulk-crawling-kb/kb-crawl:latest . \
	&& docker push gcr.io/bulk-crawling-kb/kb-crawl:latest

.PHONY: kb-build-crawlresult
kb-build-crawlresult:
	$$KB_ROOT_CMD && docker build -f ./docker/crawlResult/Dockerfile -t gcr.io/bulk-crawling-kb/kb-crawlresult:latest . \
	&& docker push gcr.io/bulk-crawling-kb/kb-crawlresult:latest

.PHONY: kb-build
kb-build: kb-build-orchestrator kb-build-crawl kb-build-crawlresult

.PHONY: kb-build-parallel
kb-build-parallel:
	$(MAKE) kb-build -j3

.PHONY: kb-deploy-orchestrator
kb-deploy-orchestrator:
	kubectl create deployment orchestrator --image=gcr.io/bulk-crawling-kb/kb-orchestrator:latest
# 	kubectl set image deployment/orchestrator kb-orchestrator=gcr.io/bulk-crawling-kb/kb-orchestrator:latest

.PHONY: kb-deploy-crawl
kb-deploy-crawl:
	kubectl create deployment crawl --image=gcr.io/bulk-crawling-kb/kb-crawl:latest
# 	kubectl set image deployment/crawl kb-crawl=gcr.io/bulk-crawling-kb/kb-crawl:latest

.PHONY: kb-deploy-crawlresult
kb-deploy-crawlresult:
	kubectl create deployment crawlresult --image=gcr.io/bulk-crawling-kb/kb-crawlresult:latest
# 	kubectl set image deployment/crawlresult kb-crawlresult=gcr.io/bulk-crawling-kb/kb-crawlresult:latest

.PHONY: kb-deploy
kb-deploy: kb-deploy-orchestrator kb-deploy-crawl kb-deploy-crawlresult

.PHONY: kb-deploy-parallel
kb-deploy-parallel:
	$(MAKE) kb-deploy -j3

.PHONY: kb-expose
kb-expose:
	kubectl expose deployment orchestrator --type=LoadBalancer --port 80 --target-port 8080 \
	&& kubectl expose deployment crawl --type=LoadBalancer --port 80 --target-port 8080 \
	&& kubectl expose deployment crawlresult --type=LoadBalancer --port 80 --target-port 8080

.PHONY: kb-scale-crawl
kb-scale-crawl:
	kubectl autoscale deployment crawl --min=10 --max=100

.PHONY: kb-scale-crawlResult
kb-scale-crawlResult:
	kubectl autoscale deployment crawlresult --min=10 --max=100

