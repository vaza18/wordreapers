#!/usr/bin/env bash
# Deploy Firebase targets for the project in EXPO_PUBLIC_FIREBASE_PROJECT_ID.
#
# Auth (first match):
#   1. GOOGLE_APPLICATION_CREDENTIALS — path to a service account JSON (CI / ADC)
#   2. Interactive `firebase login` / existing CLI credentials (local)
#
# Project id: an already-exported EXPO_PUBLIC_FIREBASE_PROJECT_ID wins over .env
# (CI-safe). A stale export in a local shell can override .env — unset it when debugging.
#
# Usage: bash scripts/firebase-deploy.sh --only database|functions|database,functions …
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Preserve an already-exported project id (CI) so .env cannot overwrite it.
EXISTING_PROJECT="${EXPO_PUBLIC_FIREBASE_PROJECT_ID:-}"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ -n "$EXISTING_PROJECT" ]]; then
  EXPO_PUBLIC_FIREBASE_PROJECT_ID="$EXISTING_PROJECT"
fi

PROJECT="${EXPO_PUBLIC_FIREBASE_PROJECT_ID:-}"

if [[ -z "$PROJECT" ]]; then
  echo "Set EXPO_PUBLIC_FIREBASE_PROJECT_ID in .env (see .env.example)" >&2
  exit 1
fi

DEPLOY_ARGS=(deploy "$@" --project "$PROJECT")

if [[ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]]; then
  if [[ ! -f "$GOOGLE_APPLICATION_CREDENTIALS" ]]; then
    echo "GOOGLE_APPLICATION_CREDENTIALS is set but file not found: $GOOGLE_APPLICATION_CREDENTIALS" >&2
    exit 1
  fi
  echo "firebase-deploy: using Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS)."
  # CI / ADC: never prompt. Local interactive login still works without this flag.
  DEPLOY_ARGS+=(--non-interactive)
fi

exec npx firebase-tools "${DEPLOY_ARGS[@]}"
