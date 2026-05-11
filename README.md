# finances

Sistema de financas pessoais multi-usuario familiar — controle de contas, cartoes, contas a pagar/receber, faturas (BR/PY) e relatorios em 3 moedas isoladas (BRL/USD/PYG).

## Stack

- **Backend**: Python 3.12 + FastAPI + SQLAlchemy 2.0 + Alembic
- **Banco**: MySQL 8 (utf8mb4, DECIMAL(18,4))
- **Frontend**: React + Vite + TypeScript + Tailwind + shadcn/ui + TanStack Query + React Router
- **Auth**: JWT (access 15min + refresh rotativo 7d) + bcrypt
- **Deploy**: Docker Compose (nginx + api + frontend + mysql)
- **Scheduler**: APScheduler in-process

## Quickstart

```bash
# 1. Copia variaveis de ambiente e edita os secrets
cp .env.example .env
$EDITOR .env

# 2. Sobe a stack
make up

# 3. Aplicacao disponivel em
#    http://localhost
```

Comandos uteis:

```bash
make help      # lista todos os targets
make logs      # tail dos logs
make ps        # status dos containers
make shell-api # bash no container da API
make shell-db  # mysql shell no banco
make down      # derruba tudo (mantem volume)
make clean     # derruba + APAGA volume (cuidado!)
```

## Estrutura

```
finances/
  backend/        # FastAPI (criado pelo agent backend)
  frontend/       # React+Vite (criado pelo agent frontend)
  docker/
    docker-compose.yml
    nginx.conf
  data/
    uploads/      # anexos de faturas (bind mount)
  docs/           # documentacao tecnica
  scratchpad/     # rascunhos de agents
  Makefile
  .env.example
  TODO.md         # plano mestre em fases
  README.md
```

## Documentacao

- [TODO.md](./TODO.md) — plano mestre em 10 fases
- [docs/](./docs/) — documentacao tecnica detalhada (data model, deploy, etc)

## Deploy

Ver `docs/DEPLOY.md` (em construcao na Fase 10).
