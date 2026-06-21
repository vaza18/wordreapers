#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=eas-build-env.sh
source "$(cd "$(dirname "$0")" && pwd)/eas-build-env.sh" "npm run build:android"

exec eas build --platform android --profile production --local --clear-cache "$@"
