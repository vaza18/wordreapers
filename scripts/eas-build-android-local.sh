#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# eas build --local copies the project without gitignored .env* files.
# Export vars into the shell so prebuild, Metro, and Gradle see them.
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
    echo "Missing $key — fill .env (see .env.example) before npm run build:android" >&2
    exit 1
  fi
done

export NODE_ENV=production

exec eas build --platform android --profile production --local --clear-cache "$@"
