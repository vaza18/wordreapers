#!/usr/bin/env bash
# Upload an AAB to Google Play Internal testing via Fastlane Supply (no Expo).
# Usage: bash scripts/ci/submit-android-play.sh path/to/app.aab
#
# Play Console "release name" defaults to versionName (e.g. 1.4.0). We set it to
# "{versionCode} ({versionName})" to match the App Bundle row (e.g. 53 (1.4.0)).
# Override with PLAY_RELEASE_NAME if needed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AAB_PATH="${1:-}"
PACKAGE_NAME="${ANDROID_PACKAGE_NAME:-com.wordreapers.app}"
JSON_KEY="${GOOGLE_PLAY_JSON_KEY:-$ROOT/.ci/credentials/google-play.json}"
TRACK="${PLAY_TRACK:-internal}"
RELEASE_STATUS="${PLAY_RELEASE_STATUS:-completed}"
# Pinned Google bundletool for reading versionCode/versionName from the AAB.
BUNDLETOOL_VERSION="${BUNDLETOOL_VERSION:-1.18.1}"

if [[ -z "$AAB_PATH" || ! -f "$AAB_PATH" ]]; then
  echo "Usage: $0 path/to/app.aab" >&2
  exit 1
fi
if [[ ! -f "$JSON_KEY" ]]; then
  echo "Missing Play service account JSON at $JSON_KEY" >&2
  exit 1
fi

resolve_play_release_name() {
  if [[ -n "${PLAY_RELEASE_NAME:-}" ]]; then
    printf '%s\n' "$PLAY_RELEASE_NAME"
    return
  fi

  local jar_dir="$ROOT/.ci/tools"
  local jar="$jar_dir/bundletool-all-${BUNDLETOOL_VERSION}.jar"
  mkdir -p "$jar_dir"
  if [[ ! -f "$jar" ]]; then
    echo "Downloading bundletool ${BUNDLETOOL_VERSION}…"
    curl -fsSL -o "$jar" \
      "https://github.com/google/bundletool/releases/download/${BUNDLETOOL_VERSION}/bundletool-all-${BUNDLETOOL_VERSION}.jar"
  fi

  local version_code version_name
  version_code="$(
    java -jar "$jar" dump manifest --bundle "$AAB_PATH" --xpath /manifest/@android:versionCode | tr -d '[:space:]'
  )"
  version_name="$(
    java -jar "$jar" dump manifest --bundle "$AAB_PATH" --xpath /manifest/@android:versionName | tr -d '[:space:]'
  )"
  if [[ -z "$version_code" || -z "$version_name" ]]; then
    echo "ERROR: could not read versionCode/versionName from $AAB_PATH" >&2
    exit 1
  fi
  printf '%s (%s)\n' "$version_code" "$version_name"
}

RELEASE_NAME="$(resolve_play_release_name)"

# shellcheck source=ensure-fastlane.sh
source "$ROOT/scripts/ci/ensure-fastlane.sh"

echo "Uploading $AAB_PATH → Play track=$TRACK status=$RELEASE_STATUS package=$PACKAGE_NAME release_name=$RELEASE_NAME"
# supply --version_name sets the Google Play release *name* (not only Android versionName).
bundle exec fastlane supply \
  --aab "$AAB_PATH" \
  --json_key "$JSON_KEY" \
  --package_name "$PACKAGE_NAME" \
  --track "$TRACK" \
  --release_status "$RELEASE_STATUS" \
  --version_name "$RELEASE_NAME" \
  --skip_upload_metadata \
  --skip_upload_images \
  --skip_upload_screenshots \
  --skip_upload_changelogs

echo "Play Internal upload finished."
