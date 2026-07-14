#!/usr/bin/env bash
# CI: local EAS production build + submit to Play Internal / TestFlight (submit profile "testing").
# Usage: bash scripts/ci/release-build-submit.sh android|ios [--clear-cache]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PLATFORM="${1:-}"
CLEAR_CACHE=0
shift || true
for arg in "$@"; do
  case "$arg" in
    --clear-cache) CLEAR_CACHE=1 ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ "$PLATFORM" != "android" && "$PLATFORM" != "ios" ]]; then
  echo "Usage: $0 android|ios [--clear-cache]" >&2
  exit 1
fi

# shellcheck source=../eas-build-env.sh
source "$ROOT/scripts/eas-build-env.sh" "ci release-build-submit ($PLATFORM)"

if [[ ! -f "$ROOT/assets/generated/dictionaries/uk-uk/dictionary.txt" ]]; then
  echo "Building uk-uk dictionary before EAS archive…" >&2
  npm run dict:all --prefix "$ROOT"
fi

OUT_DIR="$ROOT/.ci/artifacts"
mkdir -p "$OUT_DIR"
if [[ "$PLATFORM" == "android" ]]; then
  OUT_PATH="$OUT_DIR/wordreapers.aab"
else
  OUT_PATH="$OUT_DIR/wordreapers.ipa"
fi
rm -f "$OUT_PATH"

BUILD_ARGS=(
  build
  --platform "$PLATFORM"
  --profile production
  --local
  --non-interactive
  --output "$OUT_PATH"
)
if [[ "$CLEAR_CACHE" -eq 1 ]]; then
  BUILD_ARGS+=(--clear-cache)
fi

echo "Running: eas ${BUILD_ARGS[*]}"
eas "${BUILD_ARGS[@]}"

if [[ ! -f "$OUT_PATH" ]]; then
  echo "Build finished but artifact missing at $OUT_PATH" >&2
  exit 1
fi

echo "Submitting $OUT_PATH via submit profile testing…"
eas submit \
  --platform "$PLATFORM" \
  --profile testing \
  --path "$OUT_PATH" \
  --non-interactive \
  --wait

echo "Done: $PLATFORM build + submit."
