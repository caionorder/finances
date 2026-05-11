#!/usr/bin/env bash
# Restaura DB a partir de um dump .sql ou .sql.gz
# ATENCAO: substitui o banco atual.
set -euo pipefail

if [ -z "${1:-}" ]; then
    echo "Uso: $0 <backup_file.sql[.gz]>"
    exit 1
fi

BACKUP_FILE="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
COMPOSE_DIR="${COMPOSE_DIR:-$PROJECT_ROOT/docker}"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Arquivo nao encontrado: $BACKUP_FILE"
    exit 1
fi

if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    . "$PROJECT_ROOT/.env"
    set +a
fi

: "${MYSQL_USER:?MYSQL_USER nao definido (.env)}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD nao definido (.env)}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE nao definido (.env)}"

echo "WARNING: vai SUBSTITUIR o banco '$MYSQL_DATABASE' atual pelo conteudo de $BACKUP_FILE."
read -r -p "Confirma? (digite 'yes' pra continuar): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Abortado."
    exit 1
fi

CAT_CMD="cat"
case "$BACKUP_FILE" in
    *.gz) CAT_CMD="zcat" ;;
esac

$CAT_CMD "$BACKUP_FILE" | docker compose -f "$COMPOSE_DIR/docker-compose.yml" --env-file "$PROJECT_ROOT/.env" exec -T mysql \
    sh -c 'exec mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'

echo "Restore completo."
