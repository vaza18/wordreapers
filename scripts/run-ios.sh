#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/ios-common.sh
source "$ROOT/scripts/ios-common.sh"

if [ -d /opt/homebrew/bin ]; then
  export PATH="/opt/homebrew/bin:$PATH"
fi

if [ ! -f .env ]; then
  echo "Missing .env — copy from .env.example and fill Firebase keys."
  exit 1
fi

DEVICE_UDID="${IOS_DEVICE_UDID:-}"
EXPO_ARGS=(--no-bundler)
REMAINING_ARGS=()

while [ $# -gt 0 ]; do
  case "$1" in
    -d|--device)
      if [ -n "${2:-}" ] && [[ "$2" != -* ]]; then
        if resolved="$(resolve_expo_device_udid "$2")"; then
          DEVICE_UDID="$resolved"
        else
          DEVICE_UDID="$2"
        fi
        EXPO_ARGS+=(--device "$DEVICE_UDID")
        shift 2
      else
        EXPO_ARGS+=(--device)
        shift
      fi
      ;;
    *)
      if [ -z "$DEVICE_UDID" ] && [[ "$1" != -* ]]; then
        if resolved="$(resolve_expo_device_udid "$1" 2>/dev/null || true)"; then
          DEVICE_UDID="$resolved"
          EXPO_ARGS+=(--device "$DEVICE_UDID")
          shift
          continue
        fi
      fi
      REMAINING_ARGS+=("$1")
      shift
      ;;
  esac
done

ensure_metro "$DEVICE_UDID"
if [ -n "$DEVICE_UDID" ]; then
  apply_ios_native_patches "$ROOT"
else
  apply_ios_simulator_patches "$ROOT"
fi

if [ "${IOS_DEVICE_FRESH:-}" = "1" ]; then
  echo "Fresh iOS build: clearing native build cache…"
  EXPO_ARGS+=(--no-build-cache)
  rm -rf "$ROOT/node_modules/.cache/metro-bundler" 2>/dev/null || true
fi

BUILD_STARTED_AT="$(date +%s)"

if [ -n "$DEVICE_UDID" ]; then
  echo "Building for physical device $DEVICE_UDID (iphoneos)…"
else
  echo "Select a simulator or connected iPhone in the Expo prompt…"
  EXPO_ARGS+=(--device)
fi

if [ ${#REMAINING_ARGS[@]} -gt 0 ]; then
  set +e
  npx expo run:ios "${EXPO_ARGS[@]}" "${REMAINING_ARGS[@]}"
  expo_exit=$?
  set -e
else
  set +e
  npx expo run:ios "${EXPO_ARGS[@]}"
  expo_exit=$?
  set -e
fi

if [ "$expo_exit" -ne 0 ] && [ -z "$DEVICE_UDID" ]; then
  echo ""
  echo "Build may have succeeded but Simulator timed out opening the dev-client URL (simctl openurl)."
  echo "→ Open Simulator and tap Slovozbirachi, or press i in the Metro terminal."
  if [ -d "$ROOT/ios/build/Build/Products/Debug-iphonesimulator" ] || \
    find "$HOME/Library/Developer/Xcode/DerivedData" -maxdepth 5 -name 'Debug-iphonesimulator' -type d 2>/dev/null | grep -q .; then
    expo_exit=0
  fi
fi

if [ "$expo_exit" -ne 0 ]; then
  exit "$expo_exit"
fi

finalize_physical_ios_app_if_built "$ROOT" "$DEVICE_UDID" "$BUILD_STARTED_AT"
