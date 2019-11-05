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

.PHONY: cf-deploy-bootstrap
cf-deploy-bootstrap:
	$(call cfDeploy,bootstrap --runtime nodejs10 --trigger-http --max-instances 1 $$CF_ARGS)

.PHONY: cf-deploy
cf-deploy: cf-deploy-imports cf-deploy-job cf-deploy-crawl cf-deploy-crawlResult cf-deploy-bootstrap

.PHONY: cf-deploy-parallel
cf-deploy-parallel:
	$(MAKE) cf-deploy -j5

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

# local nodejs for testing
.PHONY: kb-dev-up
kb-dev-up:
	$$KB_ROOT_CMD && docker-compose up --build -d

.PHONY: kb-dev-down
kb-dev-down:
	$$KB_ROOT_CMD && docker-compose down --remove-orphans

.PHONY: kb-dev-down-up
kb-dev-down-up: kb-dev-down kb-dev-up

# build
.PHONY: kb-build-orchestrator
kb-build-orchestrator:
	$$KB_ROOT_CMD && docker build -f ./docker/orchestrator/Dockerfile -t gcr.io/bulk-crawling-kb/kb-orchestrator:$(v) . \
	&& docker push gcr.io/bulk-crawling-kb/kb-orchestrator:$(v)

.PHONY: kb-build-crawl
kb-build-crawl:
	$$KB_ROOT_CMD && docker build -f ./docker/crawl/Dockerfile -t gcr.io/bulk-crawling-kb/kb-crawl:$(v) . \
	&& docker push gcr.io/bulk-crawling-kb/kb-crawl:$(v)

.PHONY: kb-build-crawlresult
kb-build-crawlresult:
	$$KB_ROOT_CMD && docker build -f ./docker/crawlResult/Dockerfile -t gcr.io/bulk-crawling-kb/kb-crawlresult:$(v) . \
	&& docker push gcr.io/bulk-crawling-kb/kb-crawlresult:$(v)

.PHONY: kb-build
kb-build: kb-build-orchestrator kb-build-crawl kb-build-crawlresult

.PHONY: kb-build-parallel
kb-build-parallel:
	$(MAKE) kb-build -j3

# deploy
.PHONY: kb-deploy-orchestrator
kb-deploy-orchestrator:
	kubectl create deployment orchestrator --image=gcr.io/bulk-crawling-kb/kb-orchestrator:$(v) \
	; kubectl set image deployment/orchestrator kb-orchestrator=gcr.io/bulk-crawling-kb/kb-orchestrator:$(v)

.PHONY: kb-deploy-crawl
kb-deploy-crawl:
	kubectl create deployment crawl --image=gcr.io/bulk-crawling-kb/kb-crawl:$(v) \
	; kubectl set image deployment/crawl kb-crawl=gcr.io/bulk-crawling-kb/kb-crawl:$(v)

.PHONY: kb-deploy-crawlresult
kb-deploy-crawlresult:
	kubectl create deployment crawlresult --image=gcr.io/bulk-crawling-kb/kb-crawlresult:$(v) \
	; kubectl set image deployment/crawlresult kb-crawlresult=gcr.io/bulk-crawling-kb/kb-crawlresult:$(v)

.PHONY: kb-deploy
kb-deploy: kb-deploy-orchestrator kb-deploy-crawl kb-deploy-crawlresult

.PHONY: kb-deploy-parallel
kb-deploy-parallel:
	$(MAKE) kb-deploy -j3

# rolling upgrade
.PHONY: kb-redeploy-orchestrator
kb-redeploy-orchestrator:
	kubectl set image deployment/orchestrator kb-orchestrator=gcr.io/bulk-crawling-kb/kb-orchestrator:$(v)

.PHONY: kb-redeploy-crawl
kb-redeploy-crawl:
	kubectl set image deployment/crawl kb-crawl=gcr.io/bulk-crawling-kb/kb-crawl:$(v)

.PHONY: kb-redeploy-crawlresult
kb-redeploy-crawlresult:
	kubectl set image deployment/crawlresult kb-crawlresult=gcr.io/bulk-crawling-kb/kb-crawlresult:$(v)

.PHONY: kb-redeploy
kb-redeploy: kb-redeploy-orchestrator kb-redeploy-crawl kb-redeploy-crawlresult

.PHONY: kb-redeploy-parallel
kb-redeploy-parallel:
	$(MAKE) kb-redeploy -j3

# expode cluster
.PHONY: kb-expose
kb-expose:
	kubectl expose deployment orchestrator --type=LoadBalancer --port 80 --target-port 8080

# scaling
.PHONY: kb-scale-crawl
kb-scale-crawl:
	kubectl delete hpa crawl \
	; kubectl apply -f ./kubernetes/kb/hpa-crawl.yml

.PHONY: kb-scale-crawlResult
kb-scale-crawlResult:
	kubectl delete hpa crawlresult \
	; kubectl apply -f ./kubernetes/kb/hpa-crawlResult.yml

.PHONY: kb-scale
kb-scale: kb-scale-crawl kb-scale-crawlResult

.PHONY: kb-scale-parallel
kb-scale-parallel:
	$(MAKE) kb-scale -j2
