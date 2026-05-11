#!/usr/bin/env bash
# Deploy local -> producao (64.23.131.102 / fin.norder.dev).
#
# Pipeline: git push origin main -> ssh remote git pull --ff-only
#   -> (opcional) make build -> make up -> health check via curl
#
# Flags:
#   --no-build    pula `make build` no servidor (so git pull + up)
#   --restart     forca `docker compose up -d --force-recreate` em vez de up normal
#   --dry-run     imprime o que rodaria, sem executar
#   --skip-push   nao roda git push (assume que a tip ja esta no remote)
#   -h | --help   ajuda
#
# Requisitos:
#   - branch atual = main
#   - tree limpa (sem mudancas nao commitadas)
#   - SSH key autorizada em root@$DEPLOY_HOST
#
# Variaveis de ambiente (override):
#   DEPLOY_HOST       (default: 64.23.131.102)
#   DEPLOY_USER       (default: root)
#   DEPLOY_PATH       (default: /opt/finances)
#   HEALTH_URL        (default: https://fin.norder.dev/api/health)
#   HEALTH_TIMEOUT_S  (default: 60)
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-64.23.131.102}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/finances}"
HEALTH_URL="${HEALTH_URL:-https://fin.norder.dev/api/health}"
HEALTH_TIMEOUT_S="${HEALTH_TIMEOUT_S:-60}"

DO_BUILD=1
FORCE_RECREATE=0
DRY_RUN=0
SKIP_PUSH=0

if [ -t 1 ]; then
    C_OK=$'\033[32m'; C_ERR=$'\033[31m'; C_DIM=$'\033[90m'; C_BOLD=$'\033[1m'; C_RST=$'\033[0m'
else
    C_OK=""; C_ERR=""; C_DIM=""; C_BOLD=""; C_RST=""
fi
ok()   { printf "%s\xe2\x9c\x93%s %s\n" "$C_OK"  "$C_RST" "$*"; }
err()  { printf "%s\xe2\x9c\x97%s %s\n" "$C_ERR" "$C_RST" "$*" >&2; }
step() { printf "%s\xe2\x86\x92%s %s\n" "$C_DIM" "$C_RST" "$*"; }
die()  { err "$*"; exit 1; }

usage() {
    sed -n '2,/^set -euo/p' "$0" | sed -e 's/^# \{0,1\}//' -e '$d'
}

while [ $# -gt 0 ]; do
    case "$1" in
        --no-build)  DO_BUILD=0 ;;
        --restart)   FORCE_RECREATE=1 ;;
        --dry-run)   DRY_RUN=1 ;;
        --skip-push) SKIP_PUSH=1 ;;
        -h|--help)   usage; exit 0 ;;
        *) die "flag desconhecida: $1 (use --help)" ;;
    esac
    shift
done

run() {
    if [ "$DRY_RUN" -eq 1 ]; then
        step "[dry-run] $*"
    else
        step "$*"
        eval "$@"
    fi
}

run_remote() {
    local cmd="$1"
    if [ "$DRY_RUN" -eq 1 ]; then
        step "[dry-run] ssh ${DEPLOY_USER}@${DEPLOY_HOST} '$cmd'"
    else
        step "ssh ${DEPLOY_USER}@${DEPLOY_HOST} <<< $cmd"
        ssh -o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=10 \
            "${DEPLOY_USER}@${DEPLOY_HOST}" "$cmd"
    fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

printf "%sdeploy%s host=%s path=%s build=%s recreate=%s dry-run=%s\n" \
    "$C_BOLD" "$C_RST" "$DEPLOY_HOST" "$DEPLOY_PATH" \
    "$DO_BUILD" "$FORCE_RECREATE" "$DRY_RUN"
echo

# -----------------------------------------------------------------------------
# 1) pre-flight local
# -----------------------------------------------------------------------------
step "preflight: branch + tree limpa"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCH" = "main" ] || die "branch atual e '$BRANCH', esperado 'main'"
if [ -n "$(git status --porcelain)" ]; then
    git status --short
    die "tree nao esta limpa; faca commit/stash antes do deploy"
fi
LOCAL_SHA=$(git rev-parse --short HEAD)
ok "branch=main commit=$LOCAL_SHA"

# -----------------------------------------------------------------------------
# 2) git push
# -----------------------------------------------------------------------------
if [ "$SKIP_PUSH" -eq 1 ]; then
    step "skip-push: nao envia para origin"
else
    run "git push origin main"
    ok "push origin/main"
fi

# -----------------------------------------------------------------------------
# 3) remote: pull + build + up
# -----------------------------------------------------------------------------
REMOTE_CMD="set -e; cd ${DEPLOY_PATH}; "
REMOTE_CMD+="echo '>> git pull'; git pull --ff-only; "
if [ "$DO_BUILD" -eq 1 ]; then
    REMOTE_CMD+="echo '>> make build'; make build; "
fi
if [ "$FORCE_RECREATE" -eq 1 ]; then
    REMOTE_CMD+="echo '>> compose up -d --force-recreate'; docker compose -f docker/docker-compose.yml --env-file .env up -d --force-recreate; "
else
    REMOTE_CMD+="echo '>> make up'; make up; "
fi
REMOTE_CMD+="echo '>> make ps'; make ps"

run_remote "$REMOTE_CMD"
ok "remote pull/build/up concluido"

# -----------------------------------------------------------------------------
# 4) healthcheck
# -----------------------------------------------------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
    step "[dry-run] healthcheck: GET $HEALTH_URL ate ${HEALTH_TIMEOUT_S}s"
    ok "dry-run OK"
    exit 0
fi

step "healthcheck: GET $HEALTH_URL (timeout ${HEALTH_TIMEOUT_S}s)"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT_S ))
body=""
status=0
while [ "$(date +%s)" -lt "$deadline" ]; do
    body=$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null || true)
    if printf '%s' "$body" | grep -q '"status":"ok"'; then
        status=1
        break
    fi
    sleep 2
done

if [ "$status" -eq 1 ]; then
    ok "health=$body"
    exit 0
else
    err "healthcheck nao retornou status=ok em ${HEALTH_TIMEOUT_S}s; ultimo body: $body"
    exit 1
fi
