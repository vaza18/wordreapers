#!/usr/bin/env bash
# Non-interactive Firebase backend deploy for CI.
# Writes FIREBASE_SERVICE_ACCOUNT_JSON to a temp file, sets GOOGLE_APPLICATION_CREDENTIALS,
# then deploys rules and/or functions sequentially (rules first).
#
# Usage:
#   DEPLOY_RULES=true|false DEPLOY_FUNCTIONS=true|false \
#   EXPO_PUBLIC_FIREBASE_PROJECT_ID=… FIREBASE_SERVICE_ACCOUNT_JSON='{…}' \
#   bash scripts/ci/firebase-deploy-ci.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

DEPLOY_RULES="${DEPLOY_RULES:-false}"
DEPLOY_FUNCTIONS="${DEPLOY_FUNCTIONS:-false}"

if [[ "$DEPLOY_RULES" != "true" && "$DEPLOY_FUNCTIONS" != "true" ]]; then
  echo "Nothing to deploy (DEPLOY_RULES=${DEPLOY_RULES} DEPLOY_FUNCTIONS=${DEPLOY_FUNCTIONS})."
  exit 0
fi

if [[ -z "${EXPO_PUBLIC_FIREBASE_PROJECT_ID:-}" ]]; then
  echo "Missing EXPO_PUBLIC_FIREBASE_PROJECT_ID" >&2
  exit 1
fi

if [[ -z "${FIREBASE_SERVICE_ACCOUNT_JSON:-}" ]]; then
  echo "Missing FIREBASE_SERVICE_ACCOUNT_JSON" >&2
  exit 1
fi

TMP_DIR="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
# macOS mktemp requires the X template at the end of the basename (not before .json).
CRED_TMP="$(mktemp "${TMP_DIR}/firebase-sa.XXXXXX")"
CRED_FILE="${CRED_TMP}.json"
mv "$CRED_TMP" "$CRED_FILE"
cleanup() {
  rm -f "$CRED_FILE"
}
trap cleanup EXIT

printf '%s' "$FIREBASE_SERVICE_ACCOUNT_JSON" >"$CRED_FILE"
chmod 600 "$CRED_FILE"
export GOOGLE_APPLICATION_CREDENTIALS="$CRED_FILE"
# Drop JSON from the process environment after the file is written (ADC uses the path).
unset FIREBASE_SERVICE_ACCOUNT_JSON

echo "Using service account credentials at GOOGLE_APPLICATION_CREDENTIALS (path only; secret not printed)."

# Sequential: rules before functions (never parallel).
if [[ "$DEPLOY_RULES" == "true" ]]; then
  echo "Deploying RTDB database rules…"
  npm run firebase:deploy:rules
  if [[ "$DEPLOY_FUNCTIONS" == "true" ]]; then
    echo "::warning::RTDB rules are live; Cloud Functions deploy follows. If functions fail, re-run with force=true and target=functions (or both)."
  fi
fi

if [[ "$DEPLOY_FUNCTIONS" == "true" ]]; then
  echo "Deploying Cloud Functions…"
  npm run firebase:deploy:functions
fi

echo "Firebase backend deploy finished."
