#!/usr/bin/env bash
#
# Deploy the built Zolai Explorer SPA to pcore-server.
#
#   bun run deploy        # vite build + rsync (+ nginx -t safety check)
#
# The SPA is served from its own host, https://studio.zolai.space/, whose nginx
# vhost (`/etc/nginx/sites-available/zolai-studio`, installed by hand) has
# `root /var/www/zolai-studio` and `try_files $uri $uri/ /index.html`.
#
# This script NEVER edits nginx and never touches the API vhost: the studio
# document root is a plain static directory, so shipping a new bundle needs
# nothing but rsync.

set -euo pipefail

REMOTE_HOST="${ZOLAI_DEPLOY_HOST:-pcore-server}"
REMOTE_DIR="${ZOLAI_DEPLOY_DIR:-/var/www/zolai-studio}"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/dist"

# The rsync below runs with --delete, so refuse any destination that is not the
# studio document root. Cheap insurance against a wrong ZOLAI_DEPLOY_DIR wiping
# something that matters.
if [[ "${REMOTE_DIR}" != */zolai-studio ]]; then
  echo "error: refusing to rsync --delete into '${REMOTE_DIR}' (must end in /zolai-studio)" >&2
  exit 1
fi

if [[ ! -f "${LOCAL_DIR}/index.html" ]]; then
  echo "error: ${LOCAL_DIR}/index.html not found — run 'bun run build' first." >&2
  exit 1
fi

# The studio is cross-origin from the API, so the bundle must carry an absolute
# API base (see .env.production, loaded by `vite build`). Fail loudly rather than
# shipping a bundle whose panels would all 404 against studio.zolai.space.
if ! grep -qF 'https://api.zolai.space/api/v1' "${LOCAL_DIR}"/assets/*.js; then
  echo "error: built bundle has no absolute VITE_API_BASE — check .env.production." >&2
  exit 1
fi
# Regression guard: /health lives at the origin root, never under /api/v1.
if grep -qF '/api/v1/health' "${LOCAL_DIR}"/assets/*.js; then
  echo "error: built bundle references /api/v1/health — /health must stay outside /api/v1." >&2
  exit 1
fi

echo "==> checking ssh access to ${REMOTE_HOST}"
ssh -o BatchMode=yes -o ConnectTimeout=10 "${REMOTE_HOST}" 'true'

echo "==> ensuring ${REMOTE_DIR} exists"
ssh "${REMOTE_HOST}" "sudo -n mkdir -p '${REMOTE_DIR}' && sudo -n chown -R \$(whoami) '${REMOTE_DIR}'"

echo "==> syncing ${LOCAL_DIR}/ -> ${REMOTE_HOST}:${REMOTE_DIR}/"
# --delete keeps the remote free of stale hashed assets after a rebuild.
# Scoped to ${REMOTE_DIR} only, and guarded by the check above.
rsync -az --delete --human-readable \
  --exclude '.DS_Store' \
  "${LOCAL_DIR}/" "${REMOTE_HOST}:${REMOTE_DIR}/"

# Safety check only — this script changed no nginx config. Validating before the
# reload means a broken vhost can never be activated by a deploy.
echo "==> validating nginx config"
ssh "${REMOTE_HOST}" 'sudo -n nginx -t'

echo "==> reloading nginx"
ssh "${REMOTE_HOST}" 'sudo -n systemctl reload nginx'

echo
echo "==> deployed. verify with:"
echo "    curl -sI https://studio.zolai.space/            | head -1"
echo "    curl -sI https://studio.zolai.space/word/pasian | head -1   # SPA fallback"
echo "    curl -sI https://api.zolai.space/health         | head -1   # no regression"