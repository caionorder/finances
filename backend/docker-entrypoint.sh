#!/bin/sh
# Backend entrypoint:
# 1) aplica migrations (idempotente)
# 2) garante diretorio de uploads
# 3) sobe uvicorn com numero de workers configuravel
set -e

cd /app

echo "[entrypoint] alembic upgrade head"
alembic upgrade head

if [ -n "${UPLOAD_DIR:-}" ]; then
  mkdir -p "${UPLOAD_DIR}"
fi

WORKERS="${UVICORN_WORKERS:-2}"
echo "[entrypoint] uvicorn workers=${WORKERS}"
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers "${WORKERS}" \
  --proxy-headers \
  --forwarded-allow-ips='*'
