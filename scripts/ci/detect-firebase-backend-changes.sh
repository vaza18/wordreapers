#!/usr/bin/env bash
# Detect whether Firebase RTDB rules and/or Cloud Functions changed vs previous v* tag.
# Writes deploy_rules / deploy_functions to GITHUB_OUTPUT (and stdout).
#
# Usage:
#   bash scripts/ci/detect-firebase-backend-changes.sh \
#     --current-ref <ref> [--version-tag vX.Y.Z] [--target auto|rules|functions|both] [--force true|false]
#
# Notes:
#   - target=both without force is selective (same as auto): deploy only what changed.
#   - target=both with force deploys both even when the diff is empty.
set -euo pipefail

CURRENT_REF=""
VERSION_TAG=""
TARGET="auto"
FORCE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --current-ref | --version-tag | --target | --force)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for $1" >&2
        exit 1
      fi
      case "$1" in
        --current-ref) CURRENT_REF="$2" ;;
        --version-tag) VERSION_TAG="$2" ;;
        --target) TARGET="$2" ;;
        --force) FORCE="$2" ;;
      esac
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$CURRENT_REF" ]]; then
  echo "Missing --current-ref" >&2
  exit 1
fi

TARGET="$(printf '%s' "$TARGET" | tr '[:upper:]' '[:lower:]')"
case "$TARGET" in
  auto | rules | functions | both) ;;
  *)
    echo "Invalid --target: $TARGET (expected auto|rules|functions|both)" >&2
    exit 1
    ;;
esac

FORCE_LC="$(printf '%s' "$FORCE" | tr '[:upper:]' '[:lower:]')"
case "$FORCE_LC" in
  true | false) ;;
  *)
    echo "Invalid --force: $FORCE (expected true|false)" >&2
    exit 1
    ;;
esac

emit() {
  local key="$1"
  local value="$2"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    echo "${key}=${value}" >>"$GITHUB_OUTPUT"
  fi
  echo "${key}=${value}"
}

if ! CURRENT_SHA="$(git rev-parse -q --verify "${CURRENT_REF}^{commit}" 2>/dev/null)"; then
  echo "Cannot resolve current ref: $CURRENT_REF" >&2
  exit 1
fi

# Semver tags vX.Y.Z, newest first.
ALL_TAGS=()
while IFS= read -r tag; do
  [[ -n "$tag" ]] || continue
  ALL_TAGS+=("$tag")
done < <(git tag -l 'v[0-9]*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' || true)

PREV_TAG=""
# first = no baseline (deploy both as changed); compare = diff vs PREV; skip_diff = force without baseline
MODE="compare"

if [[ -n "$VERSION_TAG" ]]; then
  if [[ ! "$VERSION_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Invalid --version-tag: $VERSION_TAG (expected vX.Y.Z)" >&2
    exit 1
  fi

  found_current=false
  saw_older=false
  for tag in "${ALL_TAGS[@]+"${ALL_TAGS[@]}"}"; do
    if [[ "$tag" == "$VERSION_TAG" ]]; then
      found_current=true
      continue
    fi
    if [[ "$found_current" != "true" ]]; then
      continue
    fi
    # After VERSION_TAG in newest-first list → older semver candidates.
    saw_older=true
    tag_sha="$(git rev-parse -q --verify "${tag}^{commit}" 2>/dev/null || true)"
    if [[ -n "$tag_sha" && "$tag_sha" == "$CURRENT_SHA" ]]; then
      continue
    fi
    # Prefer the newest older tag that is an ancestor of CURRENT (hotfix tags on
    # unrelated branches are skipped so the diff baseline stays on this history).
    if git merge-base --is-ancestor "$tag" "$CURRENT_SHA" 2>/dev/null; then
      PREV_TAG="$tag"
      break
    fi
  done

  if [[ "$found_current" != "true" ]]; then
    echo "Unknown --version-tag: $VERSION_TAG is not a local vX.Y.Z tag. Refusing over-deploy; fix the tag or omit --version-tag." >&2
    exit 1
  fi

  # version_tag is a tip marker, not a free semver cursor: it must identify CURRENT.
  VERSION_TAG_SHA="$(git rev-parse -q --verify "${VERSION_TAG}^{commit}" 2>/dev/null || true)"
  if [[ -z "$VERSION_TAG_SHA" ]]; then
    echo "Cannot resolve --version-tag ${VERSION_TAG} to a commit." >&2
    exit 1
  fi
  if [[ "$VERSION_TAG_SHA" != "$CURRENT_SHA" ]]; then
    if [[ "$FORCE_LC" == "true" ]]; then
      echo "--version-tag ${VERSION_TAG} does not point at CURRENT tip (${VERSION_TAG_SHA} != ${CURRENT_SHA}); --force set, skipping baseline diff."
      MODE="skip_diff"
      PREV_TAG=""
    else
      if git merge-base --is-ancestor "$VERSION_TAG" "$CURRENT_SHA" 2>/dev/null; then
        echo "--version-tag ${VERSION_TAG} is an ancestor of CURRENT but does not point at the tip (${VERSION_TAG_SHA} != ${CURRENT_SHA})." >&2
        echo "Pass a tag that matches the checked-out tip (release-stores does), or --force." >&2
      else
        echo "--version-tag ${VERSION_TAG} is not an ancestor of CURRENT tip ${CURRENT_SHA}." >&2
        echo "Pass a tip-matching tag, omit --version-tag, or --force." >&2
      fi
      exit 1
    fi
  elif [[ -z "$PREV_TAG" ]]; then
    if [[ "$saw_older" != "true" ]]; then
      MODE="first"
    elif [[ "$FORCE_LC" == "true" ]]; then
      echo "No ancestor older v* for ${VERSION_TAG}; --force set, skipping baseline diff."
      MODE="skip_diff"
    else
      echo "No ancestor older vX.Y.Z tag for ${VERSION_TAG} on this history (older tags exist but none are ancestors of CURRENT)." >&2
      echo "Refuse non-ancestor baseline. Pass --force to deploy without a previous-tag diff." >&2
      exit 1
    fi
  fi
else
  for tag in "${ALL_TAGS[@]+"${ALL_TAGS[@]}"}"; do
    # A commit is an ancestor of itself — skip tags that point at CURRENT_SHA or the
    # empty range PREV..CURRENT would always no-op on a tagged tip without --version-tag.
    tag_sha="$(git rev-parse -q --verify "${tag}^{commit}" 2>/dev/null || true)"
    if [[ -n "$tag_sha" && "$tag_sha" == "$CURRENT_SHA" ]]; then
      continue
    fi
    if git merge-base --is-ancestor "$tag" "$CURRENT_SHA" 2>/dev/null; then
      PREV_TAG="$tag"
      break
    fi
  done

  if [[ -z "$PREV_TAG" ]]; then
    if [[ ${#ALL_TAGS[@]} -eq 0 ]]; then
      MODE="first"
    elif [[ "$FORCE_LC" == "true" ]]; then
      echo "No ancestor v* tag for ${CURRENT_REF}; --force set, skipping baseline diff."
      MODE="skip_diff"
    else
      # Only self-tags exist (e.g. first tagged tip with no older release) → first deploy.
      only_self_tags=true
      for tag in "${ALL_TAGS[@]+"${ALL_TAGS[@]}"}"; do
        tag_sha="$(git rev-parse -q --verify "${tag}^{commit}" 2>/dev/null || true)"
        if [[ -z "$tag_sha" || "$tag_sha" != "$CURRENT_SHA" ]]; then
          only_self_tags=false
          break
        fi
      done
      if [[ "$only_self_tags" == "true" ]]; then
        echo "Only v* tag(s) at CURRENT_SHA; treating as first release (no previous tip)."
        MODE="first"
      else
        echo "No ancestor vX.Y.Z tag for ${CURRENT_REF} (have ${#ALL_TAGS[@]} tag(s), none on this history)." >&2
        echo "Refuse non-ancestor baseline. Pass --force to deploy without a previous-tag diff." >&2
        exit 1
      fi
    fi
  fi
fi

DEPLOY_RULES=false
DEPLOY_FUNCTIONS=false

if [[ "$MODE" == "first" ]]; then
  echo "No previous vX.Y.Z tag to compare; treating backend as changed."
  DEPLOY_RULES=true
  DEPLOY_FUNCTIONS=true
elif [[ "$MODE" == "compare" ]]; then
  echo "Comparing backend paths: ${PREV_TAG}..${CURRENT_REF} (${CURRENT_SHA})"
  # Capture first so a failed git diff fails the script under set -e
  # (process substitution < <(...) swallows the status).
  DIFF_OUT="$(git diff --name-only "${PREV_TAG}..${CURRENT_SHA}")" || exit 1
  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    case "$path" in
      firebase.json)
        # firebase.json configures both database rules and functions predeploy/source.
        DEPLOY_RULES=true
        DEPLOY_FUNCTIONS=true
        ;;
      firebase | firebase/*)
        # Any path under firebase/ (including renames away from database.rules.json).
        DEPLOY_RULES=true
        ;;
      functions | functions/*)
        # Bash case: * matches any string including `/`, so functions/src/foo.ts hits functions/*.
        DEPLOY_FUNCTIONS=true
        ;;
      scripts/dictionary | scripts/dictionary/*)
        # CF build copies generated dict (gitignored) from whitelist / vesum pins under scripts/dictionary.
        DEPLOY_FUNCTIONS=true
        ;;
    esac
  done <<< "$DIFF_OUT"
fi
# MODE=skip_diff: leave false until force overlay below.

# Force: deploy the requested target(s) even when the diff is empty / skipped.
if [[ "$FORCE_LC" == "true" ]]; then
  case "$TARGET" in
    auto | both)
      DEPLOY_RULES=true
      DEPLOY_FUNCTIONS=true
      ;;
    rules)
      DEPLOY_RULES=true
      ;;
    functions)
      DEPLOY_FUNCTIONS=true
      ;;
  esac
fi

# Narrow explicit targets (without expanding undeclared side).
# target=both without force stays selective (same as auto).
case "$TARGET" in
  rules)
    DEPLOY_FUNCTIONS=false
    ;;
  functions)
    DEPLOY_RULES=false
    ;;
  auto | both) ;;
esac

echo "Result: deploy_rules=${DEPLOY_RULES} deploy_functions=${DEPLOY_FUNCTIONS} (target=${TARGET} force=${FORCE_LC} prev=${PREV_TAG:-none} mode=${MODE})"
if [[ "$DEPLOY_RULES" != "true" && "$DEPLOY_FUNCTIONS" != "true" ]]; then
  echo "No backend deploy selected (unchanged paths and/or target=${TARGET} filtered the set to empty)."
fi
emit deploy_rules "$DEPLOY_RULES"
emit deploy_functions "$DEPLOY_FUNCTIONS"
emit previous_tag "${PREV_TAG:-}"
