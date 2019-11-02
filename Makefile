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

.PHONY: kb-up
kb-up:
	$$KB_ROOT_CMD && docker-compose up --build

kb-down:
	$$KB_ROOT_CMD && docker-compose down --remove-orphans
