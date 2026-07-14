#!/usr/bin/env bash
# Write gitignored store credentials from CI secrets and patch eas.json submit.testing.
# Usage: bash scripts/ci/prepare-store-credentials.sh android|ios|all
#
# Secrets GOOGLE_SERVICES_JSON / GOOGLE_SERVICE_INFO_PLIST hold FILE CONTENTS in CI.
# app.config.js treats those env names as PATH overrides — after writing files we
# re-export the variables as absolute paths (and persist them via GITHUB_ENV).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLATFORM="${1:-all}"
CRED_DIR="$ROOT/.ci/credentials"
mkdir -p "$CRED_DIR"

case "$PLATFORM" in
  android | ios | all) ;;
  *)
    echo "Usage: $0 android|ios|all" >&2
    exit 1
    ;;
esac

require() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required secret/env: $name" >&2
    exit 1
  fi
}

append_github_env() {
  local key="$1"
  local value="$2"
  if [[ -n "${GITHUB_ENV:-}" ]]; then
    # Values are paths without newlines; safe for single-line GITHUB_ENV form.
    echo "${key}=${value}" >>"$GITHUB_ENV"
  fi
}

need_android=0
need_ios=0
if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
  need_android=1
fi
if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
  need_ios=1
fi

# Capture contents before we overwrite the env names with paths.
require GOOGLE_SERVICES_JSON
require GOOGLE_SERVICE_INFO_PLIST
GOOGLE_SERVICES_JSON_CONTENT="$GOOGLE_SERVICES_JSON"
GOOGLE_SERVICE_INFO_PLIST_CONTENT="$GOOGLE_SERVICE_INFO_PLIST"

printf '%s\n' "$GOOGLE_SERVICES_JSON_CONTENT" >"$ROOT/google-services.json"
printf '%s\n' "$GOOGLE_SERVICE_INFO_PLIST_CONTENT" >"$ROOT/GoogleService-Info.plist"

# app.config.js: GOOGLE_SERVICES_JSON / GOOGLE_SERVICE_INFO_PLIST / GOOGLE_SERVICES_PLIST are paths.
export GOOGLE_SERVICES_JSON="$ROOT/google-services.json"
export GOOGLE_SERVICE_INFO_PLIST="$ROOT/GoogleService-Info.plist"
export GOOGLE_SERVICES_PLIST="$ROOT/GoogleService-Info.plist"
append_github_env GOOGLE_SERVICES_JSON "$GOOGLE_SERVICES_JSON"
append_github_env GOOGLE_SERVICE_INFO_PLIST "$GOOGLE_SERVICE_INFO_PLIST"
append_github_env GOOGLE_SERVICES_PLIST "$GOOGLE_SERVICES_PLIST"

if [[ "$need_android" -eq 1 ]]; then
  require GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
  printf '%s\n' "$GOOGLE_PLAY_SERVICE_ACCOUNT_JSON" >"$CRED_DIR/google-play.json"
fi

if [[ "$need_ios" -eq 1 ]]; then
  require ASC_API_KEY_P8
  require ASC_KEY_ID
  require ASC_ISSUER_ID
  require ASC_APP_ID

  printf '%s\n' "$ASC_API_KEY_P8" >"$CRED_DIR/AuthKey.p8"

  export EXPO_ASC_API_KEY_PATH="$CRED_DIR/AuthKey.p8"
  export EXPO_ASC_KEY_ID="$ASC_KEY_ID"
  export EXPO_ASC_ISSUER_ID="$ASC_ISSUER_ID"
  append_github_env EXPO_ASC_API_KEY_PATH "$EXPO_ASC_API_KEY_PATH"
  append_github_env EXPO_ASC_KEY_ID "$EXPO_ASC_KEY_ID"
  append_github_env EXPO_ASC_ISSUER_ID "$EXPO_ASC_ISSUER_ID"

  if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required to patch eas.json submit.testing for iOS" >&2
    exit 1
  fi

  tmp="$(mktemp)"
  jq \
    --arg keyId "$ASC_KEY_ID" \
    --arg issuerId "$ASC_ISSUER_ID" \
    --arg appId "$ASC_APP_ID" \
    '.submit.testing.ios.ascApiKeyId = $keyId
     | .submit.testing.ios.ascApiKeyIssuerId = $issuerId
     | .submit.testing.ios.ascAppId = $appId' \
    "$ROOT/eas.json" >"$tmp"
  mv "$tmp" "$ROOT/eas.json"
fi

echo "Store credentials prepared for platform=$PLATFORM."
echo "  googleServicesFile paths: $GOOGLE_SERVICES_JSON , $GOOGLE_SERVICE_INFO_PLIST"
