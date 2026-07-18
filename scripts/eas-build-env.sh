#!/usr/bin/env bash
# Source Firebase/public env for eas build --local (archive excludes gitignored .env*).
# Usage: source eas-build-env.sh android|ios
# Only the app id for that platform is required.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLATFORM="${1:-}"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
if [[ -f "$ROOT/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.local"
  set +a
fi

require_keys=(
  EXPO_PUBLIC_FIREBASE_API_KEY
  EXPO_PUBLIC_FIREBASE_DATABASE_URL
  EXPO_PUBLIC_FIREBASE_PROJECT_ID
)

case "$PLATFORM" in
  android)
    require_keys+=(EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID)
    ;;
  ios)
    require_keys+=(EXPO_PUBLIC_FIREBASE_APP_ID_IOS)
    ;;
  *)
    echo "Usage: source eas-build-env.sh android|ios" >&2
    exit 1
    ;;
esac

for key in "${require_keys[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing $key — fill .env (see .env.example) before $PLATFORM EAS build" >&2
    exit 1
  fi
done

export NODE_ENV=production
export EAS_BUILD_NO_EXPO_GO_WARNING=true
