#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

PROJECT="${EXPO_PUBLIC_FIREBASE_PROJECT_ID:-}"

if [[ -z "$PROJECT" ]]; then
  echo "Set EXPO_PUBLIC_FIREBASE_PROJECT_ID in .env (see .env.example)" >&2
  exit 1
fi

exec npx firebase-tools deploy "$@" --project "$PROJECT"
