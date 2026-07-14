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

# EAS Submit runs `bundletool dump manifest --xpath /manifest/@package` before Play.
# Fail here if --output is not a real AAB (e.g. tar.gz / truncated / wrong artifact).
if [[ "$PLATFORM" == "android" ]]; then
  echo "Validating AAB at $OUT_PATH ($(wc -c <"$OUT_PATH" | tr -d ' ') bytes)…"
  file "$OUT_PATH" || true
  if ! unzip -tqq "$OUT_PATH" >/dev/null 2>&1; then
    echo "ERROR: $OUT_PATH is not a valid zip/AAB (bundletool would fail on EAS Submit)." >&2
    if tar -tzf "$OUT_PATH" >/dev/null 2>&1; then
      echo "Hint: file looks like tar.gz with an .aab name — check applicationArchivePath / --output." >&2
      tar -tzf "$OUT_PATH" | head -40 >&2 || true
    fi
    exit 1
  fi
  if ! unzip -l "$OUT_PATH" | grep -q 'BundleConfig.pb'; then
    echo "ERROR: $OUT_PATH zip lacks BundleConfig.pb — not an Android App Bundle." >&2
    unzip -l "$OUT_PATH" | head -40 >&2 || true
    exit 1
  fi
  if ! unzip -l "$OUT_PATH" | grep -q 'base/manifest/AndroidManifest.xml'; then
    echo "ERROR: $OUT_PATH missing base/manifest/AndroidManifest.xml." >&2
    unzip -l "$OUT_PATH" | head -40 >&2 || true
    exit 1
  fi
fi

echo "Submitting $OUT_PATH via submit profile testing…"
eas submit \
  --platform "$PLATFORM" \
  --profile testing \
  --path "$OUT_PATH" \
  --non-interactive \
  --wait

echo "Done: $PLATFORM build + submit."
