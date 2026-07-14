#!/usr/bin/env bash
# Upload an IPA to TestFlight via Fastlane Pilot (no Expo / no Free Tier Submit queue).
# Usage: bash scripts/ci/submit-ios-testflight.sh path/to/app.ipa
#
# Requires ASC_KEY_ID, ASC_ISSUER_ID, and AuthKey at .ci/credentials/AuthKey.p8
# (see prepare-store-credentials.sh). Optional ASC_APP_ID (numeric Apple ID).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IPA_PATH="${1:-}"
BUNDLE_ID="${IOS_BUNDLE_IDENTIFIER:-com.wordreapers.app}"
P8_PATH="${ASC_API_KEY_PATH:-$ROOT/.ci/credentials/AuthKey.p8}"
API_KEY_JSON="${ASC_API_KEY_JSON_PATH:-$ROOT/.ci/credentials/asc-api-key.json}"

if [[ -z "$IPA_PATH" || ! -f "$IPA_PATH" ]]; then
  echo "Usage: $0 path/to/app.ipa" >&2
  exit 1
fi

if [[ -z "${ASC_KEY_ID:-}" || -z "${ASC_ISSUER_ID:-}" ]]; then
  echo "ASC_KEY_ID and ASC_ISSUER_ID are required" >&2
  exit 1
fi
if [[ ! -f "$P8_PATH" ]]; then
  echo "Missing App Store Connect API key at $P8_PATH" >&2
  exit 1
fi

# Fastlane App Store Connect API key JSON (key body from .p8).
mkdir -p "$(dirname "$API_KEY_JSON")"
P8_PATH="$P8_PATH" ASC_KEY_ID="$ASC_KEY_ID" ASC_ISSUER_ID="$ASC_ISSUER_ID" API_KEY_JSON="$API_KEY_JSON" node <<'EOF'
const fs = require('fs');
const key = fs.readFileSync(process.env.P8_PATH, 'utf8');
fs.writeFileSync(
  process.env.API_KEY_JSON,
  `${JSON.stringify(
    {
      key_id: process.env.ASC_KEY_ID,
      issuer_id: process.env.ASC_ISSUER_ID,
      key,
      in_house: false,
    },
    null,
    2,
  )}\n`,
  { mode: 0o600 },
);
EOF

# shellcheck source=ensure-fastlane.sh
source "$ROOT/scripts/ci/ensure-fastlane.sh"

PILOT_ARGS=(
  upload
  --ipa "$IPA_PATH"
  --api_key_path "$API_KEY_JSON"
  --app_identifier "$BUNDLE_ID"
  --skip_waiting_for_build_processing
)

if [[ -n "${ASC_APP_ID:-}" ]]; then
  PILOT_ARGS+=(--apple_id "$ASC_APP_ID")
fi

echo "Uploading $IPA_PATH → TestFlight (bundle=$BUNDLE_ID)…"
bundle exec fastlane pilot "${PILOT_ARGS[@]}"

echo "TestFlight upload finished (processing may continue on Apple's side)."
