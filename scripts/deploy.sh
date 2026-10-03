#!/usr/bin/env bash
#
# Deploy the built Zolai Explorer SPA to pcore-server.
#
#   bun run deploy        # vite build + rsync + nginx -t + reload
#
# Assumes:
#   - ssh/rsync access to pcore-server as the current user
#   - passwordless sudo on pcore-server for nginx config test + reload
#   - the nginx snippet in deploy/nginx/zolai-explorer.conf is already installed
#     in /etc/nginx/sites-available/zolai-api (applied once, by hand)
#
# Never touches the API vhost's `location /` (127.0.0.1:8001): the SPA lives
# under its own /explorer/ prefix and is served straight from disk.

set -euo pipefail

REMOTE="${ZOLAI_DEPLOY_HOST:-pcore-server}"
REMOTE_ROOT="${ZOLAI_DEPLOY_ROOT:-/var/www/zolai-explorer}"
# nginx `root` + a prefix `location` concatenate, so $uri=/explorer/index.html
# resolves to ${REMOTE_ROOT}/explorer/index.html. The bundle therefore has to
# sit one level down, inside an `explorer/` directory.
REMOTE_DIR="${REMOTE_ROOT}/explorer"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/dist"

if [[ ! -f "${LOCAL_DIR}/index.html" ]]; then
  echo "error: ${LOCAL_DIR}/index.html not found — run 'bun run build' first." >&2
  exit 1
fi

echo "==> checking ssh access to ${REMOTE}"
ssh -o BatchMode=yes -o ConnectTimeout=10 "${REMOTE}" 'true'

echo "==> ensuring ${REMOTE_DIR} exists"
ssh "${REMOTE}" "sudo -n mkdir -p '${REMOTE_DIR}' && sudo -n chown -R \$(whoami) '${REMOTE_DIR}'"

echo "==> syncing ${LOCAL_DIR}/ -> ${REMOTE}:${REMOTE_DIR}/"
# --delete keeps the remote free of stale hashed assets after a rebuild.
rsync -az --delete --human-readable \
  --exclude '.DS_Store' \
  "${LOCAL_DIR}/" "${REMOTE}:${REMOTE_DIR}/"

echo "==> validating nginx config"
ssh "${REMOTE}" 'sudo -n nginx -t'

echo "==> reloading nginx"
ssh "${REMOTE}" 'sudo -n systemctl reload nginx'

echo
echo "==> deployed. verify with:"
echo "    curl -sI https://api.zolai.space/explorer/ | head -1"
echo "    curl -sI https://api.zolai.space/explorer/word/pasian | head -1   # SPA fallback"
echo "    curl -sI https://api.zolai.space/health | head -1                   # no regression"