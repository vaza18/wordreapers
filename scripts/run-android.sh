#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=android-env.sh
source "$ROOT/scripts/android-env.sh"

if [[ ! -x "${JAVA_HOME:-}/bin/java" ]]; then
  echo "JAVA_HOME is not set or has no java binary."
  echo "Install Android Studio, then either:"
  echo "  source scripts/android-env.sh"
  echo "or add JAVA_HOME to ~/.zshrc (see docs/android-dev-setup.md)"
  exit 1
fi

if [[ ! -d "${ANDROID_HOME:-}" ]]; then
  echo "ANDROID_HOME is missing. See docs/android-dev-setup.md"
  exit 1
fi

cd "$ROOT"
exec npx expo run:android "$@"
