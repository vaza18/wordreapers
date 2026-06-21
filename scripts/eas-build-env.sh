#!/usr/bin/env bash
# Source Firebase/public env for eas build --local (archive excludes gitignored .env*).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
if [[ -f "$ROOT/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.local"
  set +a
fi

for key in EXPO_PUBLIC_FIREBASE_API_KEY EXPO_PUBLIC_FIREBASE_DATABASE_URL EXPO_PUBLIC_FIREBASE_PROJECT_ID; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing $key — fill .env (see .env.example) before $1" >&2
    exit 1
  fi
done

export NODE_ENV=production
export EAS_BUILD_NO_EXPO_GO_WARNING=true
