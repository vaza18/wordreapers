#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=eas-build-env.sh
source "$(cd "$(dirname "$0")" && pwd)/eas-build-env.sh" "npm run build:ios"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ ! -f "$ROOT/assets/generated/dictionaries/uk-uk/dictionary.txt.gz" ]]; then
  echo "Building uk-uk dictionary before EAS archive (missing assets/generated/dictionaries/)…" >&2
  npm run dict:all --prefix "$ROOT"
fi

exec eas build --platform ios --profile production --local --clear-cache "$@"
