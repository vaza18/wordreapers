#!/usr/bin/env bash
# Upload an AAB to Google Play Internal testing via Fastlane Supply (no Expo).
# Usage: bash scripts/ci/submit-android-play.sh path/to/app.aab
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AAB_PATH="${1:-}"
PACKAGE_NAME="${ANDROID_PACKAGE_NAME:-com.wordreapers.app}"
JSON_KEY="${GOOGLE_PLAY_JSON_KEY:-$ROOT/.ci/credentials/google-play.json}"
TRACK="${PLAY_TRACK:-internal}"
RELEASE_STATUS="${PLAY_RELEASE_STATUS:-completed}"

if [[ -z "$AAB_PATH" || ! -f "$AAB_PATH" ]]; then
  echo "Usage: $0 path/to/app.aab" >&2
  exit 1
fi
if [[ ! -f "$JSON_KEY" ]]; then
  echo "Missing Play service account JSON at $JSON_KEY" >&2
  exit 1
fi

# shellcheck source=ensure-fastlane.sh
source "$ROOT/scripts/ci/ensure-fastlane.sh"

echo "Uploading $AAB_PATH → Play track=$TRACK status=$RELEASE_STATUS package=$PACKAGE_NAME"
bundle exec fastlane supply \
  --aab "$AAB_PATH" \
  --json_key "$JSON_KEY" \
  --package_name "$PACKAGE_NAME" \
  --track "$TRACK" \
  --release_status "$RELEASE_STATUS" \
  --skip_upload_metadata \
  --skip_upload_images \
  --skip_upload_screenshots \
  --skip_upload_changelogs

echo "Play Internal upload finished."
