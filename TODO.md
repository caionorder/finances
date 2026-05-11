# Sistema de Financas Pessoais - TODO Mestre

> Plano de execucao em fases. Cada item indica a persona (agent) responsavel.
> Status: [ ] pendente | [x] concluido | [~] em andamento

## Stack & Decisoes

| Camada | Escolha |
|---|---|
| Backend | Python 3.12 + FastAPI |
| ORM | SQLAlchemy 2.0 + Alembic |
| DB | MySQL 8 (utf8mb4, DECIMAL(18,4)) |
| Frontend | React + Vite + TS + shadcn/ui + TanStack Query + React Router |
| Auth | JWT access (15min) + refresh (7d) rotativo, bcrypt |
| API externa | API key unica por workspace, header X-API-Key |
| Storage | Filesystem local (/data/uploads/<ano>/<mes>/<uuid>.<ext>) |
| Deploy | Docker Compose: nginx + api + frontend + mysql |
| Scheduler | APScheduler in-process |

Tenant unico (workspace familiar), moedas isoladas (sem FX), RBAC + ACL por Account/CreditCard.

## Modelo de Dados (resumo)

User, Workspace, ApiKey, Currency, Account, AccountAcl, CreditCard, CreditCardAcl, Category, Transaction, CreditCardPurchase, CreditCardCycle, Payable, Receivable, Recurrence, Factura, AuditLog. Detalhes completos em docs/data-model.md (a criar).

## Fase 0 - Bootstrap & Infra base
- [ ] Hephaestus: docker-compose.yml + nginx + Makefile + .env.example + .gitignore + README + TODO.md + estrutura raiz
- [ ] Zeus: scaffold backend FastAPI (app/, alembic init, pyproject.toml uv, healthcheck, settings, CORS, Dockerfile)
- [ ] Athena: scaffold frontend Vite+React+TS+Tailwind+shadcn/ui+Router+TanStack Query+axios+Dockerfile

## Fase 1 - Banco de dados & schema base (Poseidon)
- [ ] Schema SQL completo + indices (account_id+date, credit_card_id+date, category_id, due_date)
- [ ] Migration inicial Alembic + seed (currencies, categorias default, workspace singleton, admin via env)
- [ ] Validar DECIMAL(18,4) em campos monetarios, charset utf8mb4_unicode_ci

## Fase 2 - Auth & Usuarios (Zeus + Athena)
- [ ] Zeus: modulo auth (login, refresh, logout, /me) bcrypt + JWT rotativo
- [ ] Zeus: CRUD users (admin only) + endpoint convite
- [ ] Zeus: middleware RBAC require_role + helper require_account_access
- [ ] Athena: telas Login + layout autenticado (sidebar + topbar) + pagina Usuarios

## Fase 3 - Dominio core: Contas, Categorias, Transacoes (Zeus + Athena)
- [ ] Zeus: CRUD Accounts + ACL endpoints + GET /accounts/{id}/balance
- [ ] Zeus: CRUD Categories (arvore) + endpoint tree
- [ ] Zeus: CRUD Transactions + endpoint transferencia (par atomico)
- [ ] Zeus: filtros Transactions (date, account, category, kind, search) + paginacao cursor
- [ ] Athena: telas Contas (lista, form, ACL modal) + Categorias
- [ ] Athena: tela Transacoes (tabela + filtros + form modal + transferencia)

## Fase 4 - Cartoes de Credito (Zeus + Athena)
- [ ] Zeus: CRUD CreditCards + ACL
- [ ] Zeus: purchase_service - criar compra, expandir parcelamento, atribuir billing_cycle_id
- [ ] Zeus: GET /credit-cards/{id}/cycles (atual, proximos, anteriores) com agregado
- [ ] Athena: telas Cartoes + Compras + visualizacao Proxima fatura agrupada por ciclo
- [ ] Athena: form de compra com toggle parcelado + Nº parcelas

## Fase 5 - Contas a Pagar/Receber + Recorrencias (Zeus + Athena)
- [ ] Zeus: CRUD Payables/Receivables com mark_as_paid/received (cria Transaction vinculada)
- [ ] Zeus: engine Recurrence (rule_json, materializa horizonte 90d)
- [ ] Zeus: APScheduler job diario 03:00 - gera ocorrencias futuras + marca atrasados
- [ ] Athena: telas kanban (pendente/atrasado/pago) Pagar e Receber
- [ ] Athena: form com toggle recorrente + edicao serie vs ocorrencia unica

## Fase 6 - Faturas/Facturas PY (Zeus + Athena)
- [ ] Zeus: CRUD Facturas + upload (validacao MIME, max 10MB, sanitizacao nome)
- [ ] Zeus: GET /facturas/export?month=YYYY-MM&format=zip (CSV + anexos em ZIP)
- [ ] Zeus: validacao RUC paraguaio
- [ ] Athena: tela Facturas (lista + filtro mes + upload drag-drop + preview)
- [ ] Athena: botao Exportar pra contadora

## Fase 7 - Relatorios (Balanco) (Zeus + Athena)
- [ ] Zeus: /reports/cashflow (entradas/saidas por moeda, group by month)
- [ ] Zeus: /reports/by-category (com hierarquia)
- [ ] Zeus: /reports/forecast-vs-actual (previsto vs realizado)
- [ ] Zeus: /reports/net-worth (saldo contas + cartoes por moeda)
- [ ] Athena: dashboard inicial 4 widgets + pagina Relatorios com graficos + export CSV

## Fase 8 - API externa & ApiKeys (Zeus + Athena)
- [ ] Zeus: CRUD ApiKey (token 32 bytes, hash, mostra plain 1x)
- [ ] Zeus: middleware X-API-Key + bypass JWT em /api/v1/external/*
- [ ] Zeus: rotas externas (POST /external/transactions, /external/accounts, GET /external/reports/*)
- [ ] Zeus: rate limit por API key (slowapi 60req/min)
- [ ] Athena: tela Configuracoes > API Keys (criar, copiar 1x, revogar, audit)

## Fase 9 - Auditoria & Hardening (Zeus + Hera + Aegis)
- [ ] Zeus: middleware AuditLog em mutacoes sensiveis (Account, ApiKey, User, ACL)
- [ ] Hera: code review backend (correctness, ACL gaps, transacoes SQL, decimal precision)
- [ ] Aegis: security review (auth flow, JWT secrets, upload validation, SQLi, CORS, rate limit)
- [ ] Zeus + Athena: aplicar findings

## Fase 10 - Deploy (Hephaestus)
- [ ] nginx config prod (proxy /api, serve React, cache estaticos, gzip)
- [ ] docker-compose prod (volume mysql, uploads, restart policies, healthchecks)
- [ ] backup script (mysqldump diario + tar uploads, retencao 14d)
- [ ] docs/DEPLOY.md (setup VPS, .env, primeiro admin, restore)

## Fora do MVP (v2)
- 2FA TOTP
- Integracao e-Kuatia/SET PY
- Conversao FX automatica
- Mobile app
- Webhooks
- Import OFX/CSV
- Multi-workspace SaaS
