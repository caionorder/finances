.DEFAULT_GOAL := help

COMPOSE := docker compose -f docker/docker-compose.yml --env-file .env

.PHONY: help up down logs ps shell-api shell-db build rebuild restart clean migrate health backup-db restore-db

help: ## Lista os targets disponiveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

up: ## Sobe todos os servicos em background (preserva volume)
	$(COMPOSE) up -d

down: ## Derruba todos os servicos (mantem volumes — SEM perda de dados)
	$(COMPOSE) down

logs: ## Tail dos logs de todos os servicos
	$(COMPOSE) logs -f

ps: ## Mostra status dos containers
	$(COMPOSE) ps

shell-api: ## Shell bash no container da API
	$(COMPOSE) exec api /bin/bash

shell-db: ## Shell mysql no banco
	$(COMPOSE) exec mysql sh -c 'mysql -u$$MYSQL_USER -p$$MYSQL_PASSWORD $$MYSQL_DATABASE'

build: ## Rebuilda as imagens (api, frontend)
	$(COMPOSE) build

rebuild: ## Rebuild + restart sem perder volume
	$(COMPOSE) build
	$(COMPOSE) up -d --force-recreate api frontend nginx

restart: down up ## Restart completo (down + up)

migrate: ## Roda alembic upgrade head dentro do container api
	$(COMPOSE) exec api alembic upgrade head

health: ## Verifica saude da stack (mysql/api/frontend/nginx)
	@echo "=== containers ==="
	@$(COMPOSE) ps
	@echo ""
	@echo "=== /api/health ==="
	@curl -fsS http://localhost:$${NGINX_PORT:-80}/api/health && echo "" || echo "FAILED"

backup-db: ## Backup do MySQL + uploads (em ./backups)
	./scripts/backup.sh

restore-db: ## Restaura DB de um dump. Use: make restore-db FILE=backups/db_xxx.sql.gz
	@if [ -z "$(FILE)" ]; then echo "Uso: make restore-db FILE=backups/db_xxx.sql[.gz]"; exit 1; fi
	./scripts/restore.sh $(FILE)

clean: ## ATENCAO: derruba e APAGA o volume do MySQL (perda de dados!)
	@echo "AVISO: isso vai apagar o volume mysql_data e todos os dados do banco."
	@read -p "Continuar? [y/N] " ans && [ "$$ans" = "y" ] || exit 1
	$(COMPOSE) down -v
