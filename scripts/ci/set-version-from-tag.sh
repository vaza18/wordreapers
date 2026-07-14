#!/usr/bin/env bash
# Set app version from a git tag (vX.Y.Z).
# - package.json + package-lock.json via `npm version` (format-safe across npm lockfile versions)
# - app.json expo.version via JSON parse (order-independent)
# - Prettier from local node_modules (always the lockfile version; never `npx` from the network)
#
# Callers that commit version files (sync PR) must run `npm ci` first (or `--ignore-scripts`).
# Build jobs may set SKIP_PRETTIER=1 — they do not commit these files.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TAG_REF="${1:-}"
if [[ -z "$TAG_REF" ]]; then
  echo "Usage: $0 vX.Y.Z" >&2
  exit 1
fi

if [[ ! "$TAG_REF" =~ ^v([0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
  echo "Tag must look like v1.4.1 (got: $TAG_REF)" >&2
  exit 1
fi

VERSION="${BASH_REMATCH[1]}"

# Official npm tooling updates root + packages[""] versions in package-lock.json.
npm version "$VERSION" --no-git-tag-version --allow-same-version --ignore-scripts

export VERSION
node <<'EOF'
const fs = require('fs');
const version = process.env.VERSION;
const path = 'app.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
if (!data.expo || typeof data.expo !== 'object') {
  console.error('app.json missing expo object');
  process.exit(1);
}
data.expo.version = version;
// Stable pretty-print; app.json is small so key-order churn is acceptable vs regex fragility.
fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
console.log('Set app.json expo.version to', version);
EOF

if [[ "${SKIP_PRETTIER:-}" != "1" ]]; then
  PRETTIER_BIN="$ROOT/node_modules/.bin/prettier"
  if [[ ! -x "$PRETTIER_BIN" ]]; then
    echo "Local Prettier missing at ${PRETTIER_BIN}." >&2
    echo "Run npm ci (or npm ci --ignore-scripts) before this script when formatting version files." >&2
    exit 1
  fi
  # Align with repo Prettier so sync PR passes format:check (HUSKY=0 on sync).
  "$PRETTIER_BIN" --write app.json package.json
fi

echo "Set version to ${VERSION} (npm version + app.json)."
