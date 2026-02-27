#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_FILE="$ROOT_DIR/dist/seagull-card.js"
ENV_FILE="$ROOT_DIR/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  echo "Create it from .env.local.example"
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

: "${HA_HOST:?HA_HOST is required in .env.local (example: 192.168.1.50)}"
: "${HA_SSH_USER:?HA_SSH_USER is required in .env.local}"
: "${HA_TARGET_PATH:?HA_TARGET_PATH is required in .env.local (example: /config/www/seagull-card/seagull-card.js)}"

SSH_PORT="${HA_SSH_PORT:-22}"
SSH_KEY="${HA_SSH_KEY:-}"
HA_USE_SUDO="${HA_USE_SUDO:-true}"
HA_BUMP_RESOURCE_VERSION="${HA_BUMP_RESOURCE_VERSION:-true}"
HA_RESOURCE_BASE_URL="${HA_RESOURCE_BASE_URL:-/local/seagull-card/seagull-card.js}"
SSH_OPTS="-p ${SSH_PORT}"
if [[ -n "$SSH_KEY" ]]; then
  SSH_OPTS="$SSH_OPTS -i $SSH_KEY"
fi

if [[ ! -f "$DIST_FILE" ]]; then
  echo "dist/seagull-card.js not found. Run npm run build first."
  exit 1
fi

TARGET_DIR="$(dirname "$HA_TARGET_PATH")"
SUDO_PREFIX=""
if [[ "$HA_USE_SUDO" == "true" ]]; then
  SUDO_PREFIX="sudo "
fi

echo "Deploying $DIST_FILE -> ${HA_SSH_USER}@${HA_HOST}:${HA_TARGET_PATH}"
cat "$DIST_FILE" | ssh $SSH_OPTS "${HA_SSH_USER}@${HA_HOST}" "cat > /tmp/seagull-card.js && ${SUDO_PREFIX}mkdir -p \"$TARGET_DIR\" && ${SUDO_PREFIX}mv /tmp/seagull-card.js \"$HA_TARGET_PATH\""

VERSION_STAMP="$(date +%s)"
if [[ "$HA_BUMP_RESOURCE_VERSION" == "true" ]]; then
  TARGET_RESOURCE_URL="${HA_RESOURCE_BASE_URL}?v=${VERSION_STAMP}"
else
  TARGET_RESOURCE_URL="${HA_RESOURCE_BASE_URL}"
fi

echo "Ensuring Lovelace resource URL: ${TARGET_RESOURCE_URL}"
ssh $SSH_OPTS "${HA_SSH_USER}@${HA_HOST}" "${SUDO_PREFIX}python3 - <<'PY'
import json
from pathlib import Path
base_url = '${HA_RESOURCE_BASE_URL}'
target_url = '${TARGET_RESOURCE_URL}'
path = Path('/config/.storage/lovelace_resources')
if not path.exists():
    print('lovelace_resources not found; skip')
    raise SystemExit(0)
obj = json.loads(path.read_text())
changed = False
for item in obj.get('data', {}).get('items', []):
    url = item.get('url', '')
    if 'seagull-card/seagull-card.js' in url or url == base_url or url.startswith(base_url + '?v='):
        if item.get('url') != target_url:
            item['url'] = target_url
            changed = True
if changed:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')
    print('lovelace resource updated')
else:
    print('resource already up to date')
PY"

echo "✅ Deploy complete"
