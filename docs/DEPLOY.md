# Deploy — Sistema Financas Pessoais

Guia de deploy/operacao da stack. Cobre dois cenarios:

- **Local (dev/uso pessoal)**: macOS/Linux com Docker Desktop, dados no proprio host. **CRITICO:** o volume `finances_mysql_data` contem dados reais — NUNCA use `make clean` nem `docker compose down -v`.
- **Producao (VPS)**: Ubuntu/Debian, instalado em `/opt/finances`, backups cron, TLS reverso.

A stack tem 4 servicos: `mysql` (8.0), `api` (FastAPI + uvicorn), `frontend` (Vite build em nginx alpine), `nginx` (reverso proxy + headers de seguranca).

```
client -> :80 nginx -> /api/* -> api:8000  (FastAPI)
                       /*     -> frontend:80 (Vite SPA)
                                          api -> mysql:3306
```

---

## A. Operacao local (uso pessoal)

### Pre-requisitos

- Docker Desktop com Compose v2
- `.env` populado (copie de `.env.example` se nao existir)

### Ciclo de comandos (via Makefile)

```bash
make up          # sobe mysql + api + frontend + nginx em background
make down        # derruba containers (mantem volume — dados preservados)
make ps          # status dos containers
make logs        # tail -f de todos
make health      # ping em /api/health
make build       # rebuild das imagens api e frontend
make rebuild     # build + force-recreate api/frontend/nginx (mysql fica)
make restart     # down + up

make shell-api   # bash dentro do container api
make shell-db    # mysql shell no banco

make migrate     # alembic upgrade head dentro do container api (manual)
make backup-db   # dump + tar uploads para ./backups (retencao 14d)
make restore-db FILE=backups/db_xxx.sql.gz   # restaura DB

make clean       # PERIGO: down -v (apaga volume mysql, perda total)
```

### Acessos

| URL | Servico |
|---|---|
| http://localhost:80/ | Frontend SPA |
| http://localhost:80/api/ | API REST (FastAPI) |
| http://localhost:80/api/redoc | Documentacao Redoc |
| http://localhost:80/api/health | Health check |
| `mysql -h 127.0.0.1 -P 3307 -u finances -p finances` | MySQL direto do host |

A porta padrao do nginx eh `NGINX_PORT` (default 80) e a do mysql `MYSQL_HOST_PORT` (3307 pra nao conflitar com mysql/mariadb local em 3306).

### Variaveis de ambiente (.env)

| Variavel | Default/exemplo | Notas |
|---|---|---|
| `ENV` | `prod` | `prod` ou `dev`. Em prod swagger desliga e admin seed exige senha. |
| `MYSQL_ROOT_PASSWORD` | — | senha root mysql |
| `MYSQL_USER` / `MYSQL_PASSWORD` | finances/changeme | user app |
| `MYSQL_DATABASE` | finances | nome do schema |
| `MYSQL_HOST_PORT` | 3307 | porta exposta no host |
| `NGINX_PORT` | 80 | porta do reverso |
| `JWT_SECRET` | — | `openssl rand -hex 32`, min 32 chars |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 15 | |
| `REFRESH_TOKEN_EXPIRE_DAYS` | 7 | |
| `UPLOAD_DIR` | /data/uploads | path dentro do container api (bind: `./data/uploads`) |
| `API_KEY_HEADER` | X-API-Key | header pro API key externa |
| `UVICORN_WORKERS` | 2 | numero de workers do uvicorn no entrypoint |
| `TZ` | America/Sao_Paulo | |

### Migrations

O entrypoint do container `api` roda `alembic upgrade head` no boot (idempotente — seguro re-executar). Migrations pendentes sao aplicadas automaticamente em todo `make up`. Pra rodar manualmente:

```bash
make migrate
```

### Backup / Restore

#### Backup

```bash
make backup-db
# ou diretamente:
./scripts/backup.sh
```

Gera em `./backups/`:
- `db_YYYY-MM-DD_HHMMSS.sql.gz` — mysqldump com `--single-transaction --routines --triggers`
- `uploads_YYYY-MM-DD_HHMMSS.tar.gz` — tar do diretorio de uploads

Retencao padrao: 14 dias. Configuravel via env `RETENTION_DAYS`.

#### Restore

```bash
make restore-db FILE=backups/db_2026-05-11_170000.sql.gz
```

O script pede confirmacao explicita (`yes`) antes de sobrescrever. Aceita `.sql` ou `.sql.gz`.

Pra restaurar uploads:
```bash
tar -xzf backups/uploads_2026-05-11_170000.tar.gz -C ./data/
```

### Preservacao do volume mysql_data

**Comandos seguros** (mantem dados):
- `make down`, `make up`, `make restart`, `make build`, `make rebuild`
- `docker compose -f docker/docker-compose.yml down` (sem -v)
- Stop/start individual de container
- Remover container mysql sem `-v` e recriar — o compose reusa o mesmo volume nomeado

**Comandos PERIGOSOS** (apagam dados):
- `make clean` — `docker compose down -v`
- `docker volume rm finances_mysql_data`
- `docker system prune --volumes`

Volume oficial: `finances_mysql_data`, declarado com `name:` explicito no compose pra garantir mesmo nome independente do `COMPOSE_PROJECT_NAME`.

---

## B. Operacao em VPS (producao)

### Pre-requisitos

- VPS >= 2GB RAM, >= 20GB disco
- Docker 24+, Compose v2
- Git, dominio (opcional pra TLS)

### Setup inicial

```bash
sudo mkdir -p /opt/finances && cd /opt/finances
sudo git clone <REPO_URL> .
sudo mkdir -p data/uploads backups
sudo chmod 750 backups

cp .env.example .env
sudo chmod 600 .env
# Edite .env: secrets, MYSQL_HOST_PORT, etc.
```

### Primeiro boot

```bash
make build
make up    # mysql sobe, depois api (que roda migration), depois frontend, depois nginx
make ps    # confirma tudo "Up (healthy)"
```

#### Criar admin inicial

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='SuaSenhaForte!' \
    docker compose -f docker/docker-compose.yml --env-file .env run --rm \
    -e ADMIN_EMAIL -e ADMIN_PASSWORD \
    api python -m app.db.seed
```

### Backups automaticos (cron)

```cron
# /etc/cron.d/finances-backup
0 2 * * * root cd /opt/finances && PROJECT_ROOT=/opt/finances /opt/finances/scripts/backup.sh >> /var/log/finances-backup.log 2>&1
```

### TLS

Coloque Caddy/Traefik na frente do nginx (porta 443 -> 80) ou rode certbot:

```bash
docker run --rm -p 80:80 -v /etc/letsencrypt:/etc/letsencrypt certbot/certbot \
    certonly --standalone -d seu-dominio.com -m seu@email.com --agree-tos
```

Depois descomente o header `Strict-Transport-Security` em `docker/nginx.conf` e reload nginx.

### Updates

```bash
cd /opt/finances
git pull
make build
make up    # entrypoint roda alembic upgrade automaticamente
```

---

## C. Troubleshooting

| Sintoma | Causa provavel | Acao |
|---|---|---|
| `volume finances_mysql_data already exists but was not created by Docker Compose` | Volume foi criado fora do compose | Warning inofensivo — volume eh reusado normalmente |
| `container name finances-mysql is already in use` | Container previo nao foi removido | `docker rm finances-mysql` (sem -v) e `make up` |
| `JWT_SECRET must be at least 32 chars` | Secret no .env curto/placeholder | `openssl rand -hex 32` e atualize `.env` |
| MySQL nao sobe / porta em uso | 3306/3307 em uso no host | Mude `MYSQL_HOST_PORT` no `.env` |
| `ADMIN_PASSWORD env var is required` | Seed em `ENV=prod` sem password | Passe `ADMIN_PASSWORD` no `docker run` |
| 429 em login legitimo | Rate limit (10/min/IP) | Espere 1min ou ajuste limite |
| Upload de factura falha 413 | Arquivo > 15MB ou limite nginx | Aumente `client_max_body_size` no `nginx.conf` |
| Gateway 502 / 503 | api/frontend nao subiu | `make logs`, verifique `make ps` |
| Frontend healthcheck "unhealthy" no primeiro boot | nginx ainda iniciando | Aguarde 30s; `start_period: 30s` deve cobrir |
| `make migrate` falha com "can't connect" | mysql ainda fazendo init | `make ps` ate mysql `(healthy)` |

### Diagnostico rapido

```bash
make health                                           # ping no /api/health
docker compose -f docker/docker-compose.yml --env-file .env logs api      # logs backend
docker compose -f docker/docker-compose.yml --env-file .env logs nginx    # access/error
docker stats --no-stream                              # cpu/mem
```

---

## D. Notas de seguranca

- `.env` deve ter perm 600. Nao commitar.
- Slowapi atualmente usa storage in-memory: NAO escale `api` para multiplas replicas sem migrar pra Redis (rate limit fica fragmentado).
- HSTS so apos TLS funcionar (descomentar no `nginx.conf`).
- Em prod multi-tenant, validar `workspace_id` em facturas (hoje filtra so por `created_by_user_id`).
- Backup criptografado (gpg) recomendado se `./backups` for sincronizado pra cloud.

## Referencias internas

- Plano completo: `TODO.md`
- Findings de seguranca aplicados: `scratchpad/agent-zeus-fix.md`, `scratchpad/agent-aegis-f9.md`
- Arquitetura: `README.md`
- Scripts: `scripts/backup.sh`, `scripts/restore.sh`
- Entrypoint backend: `backend/docker-entrypoint.sh`
