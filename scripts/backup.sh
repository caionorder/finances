#!/usr/bin/env bash
# Backup: mysqldump + tar uploads. Retencao 14 dias.
# Pode rodar via cron OU make backup-db.
set -euo pipefail

# Resolve project root a partir do dir do script (./scripts/backup.sh -> ..)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
COMPOSE_DIR="${COMPOSE_DIR:-$PROJECT_ROOT/docker}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
UPLOADS_DIR="${UPLOADS_DIR:-$PROJECT_ROOT/data/uploads}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DATE=$(date +%Y-%m-%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Carrega .env do project root
if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    . "$PROJECT_ROOT/.env"
    set +a
fi

: "${MYSQL_USER:?MYSQL_USER nao definido (.env)}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD nao definido (.env)}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE nao definido (.env)}"

echo "[$(date)] Dumping MySQL ($MYSQL_DATABASE) -> $BACKUP_DIR/db_${DATE}.sql.gz"
docker compose -f "$COMPOSE_DIR/docker-compose.yml" --env-file "$PROJECT_ROOT/.env" exec -T mysql \
    sh -c "mysqldump --single-transaction --routines --triggers --quick --default-character-set=utf8mb4 \
    -u\"\$MYSQL_USER\" -p\"\$MYSQL_PASSWORD\" \"\$MYSQL_DATABASE\"" \
    | gzip > "$BACKUP_DIR/db_${DATE}.sql.gz"

echo "[$(date)] Archiving uploads ($UPLOADS_DIR)"
if [ -d "$UPLOADS_DIR" ]; then
    tar -czf "$BACKUP_DIR/uploads_${DATE}.tar.gz" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
fi

echo "[$(date)] Cleaning backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -maxdepth 1 -name "db_*.sql.gz"      -type f -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name "uploads_*.tar.gz" -type f -mtime +"$RETENTION_DAYS" -delete

echo "[$(date)] Backup complete:"
ls -lh "$BACKUP_DIR" | tail -10
