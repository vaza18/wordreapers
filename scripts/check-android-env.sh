#!/usr/bin/env bash
# Quick check before `npx expo run:android`
set -euo pipefail

# shellcheck source=android-env.sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=android-env.sh
source "$SCRIPT_DIR/android-env.sh"

echo "=== Android env check ==="

if [[ -n "${JAVA_HOME:-}" ]] && [[ -x "$JAVA_HOME/bin/java" ]]; then
  echo "JAVA_HOME=$JAVA_HOME"
  "$JAVA_HOME/bin/java" -version 2>&1 | head -1
else
  echo "JAVA_HOME: not set (Gradle will fail)"
  echo "Fix: source scripts/android-env.sh or see docs/android-dev-setup.md § Java"
fi

if [[ -z "${ANDROID_HOME:-}" ]]; then
  if [[ -d "$HOME/Library/Android/sdk" ]]; then
    echo "ANDROID_HOME is not set, but SDK exists at ~/Library/Android/sdk"
    echo "Add to ~/.zshrc:"
    echo '  export ANDROID_HOME=$HOME/Library/Android/sdk'
    echo '  export PATH=$PATH:$ANDROID_HOME/platform-tools'
  else
    echo "ANDROID_HOME: (not set)"
    echo "SDK folder missing: ~/Library/Android/sdk"
    echo "Install Android Studio — see docs/android-dev-setup.md"
  fi
else
  echo "ANDROID_HOME=$ANDROID_HOME"
fi

if command -v adb >/dev/null 2>&1; then
  echo "adb: $(adb version | head -1)"
  echo "Devices:"
  adb devices
else
  echo "adb: NOT FOUND (install SDK Platform-Tools)"
fi

if [[ -d "/Applications/Android Studio.app" ]]; then
  echo "Android Studio: installed"
else
  echo "Android Studio: not found in /Applications"
fi

echo "=== Done ==="
