#!/usr/bin/env bash
# Shortcut for physical iPhone builds. Without args, opens the same Expo device picker as `npm run ios`.
set -euo pipefail
exec "$(cd "$(dirname "$0")" && pwd)/run-ios.sh" "$@"
