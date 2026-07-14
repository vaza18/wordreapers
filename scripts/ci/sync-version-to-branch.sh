#!/usr/bin/env bash
# Open a PR that syncs app version from tag vX.Y.Z onto a base branch, then enable auto-merge.
#
# Usage: bash scripts/ci/sync-version-to-branch.sh vX.Y.Z [base-branch]
# Default base branch: main
#
# Exit codes:
#   0 — nothing to sync, or PR opened (auto-merge enabled or warned in summary)
#   1 — failed to create/find the sync PR
#
# Uses GH_TOKEN / GITHUB_TOKEN for git + gh. Prefer a PAT (VERSION_SYNC_TOKEN) so required
# status checks actually run on the PR (commits made with the default GITHUB_TOKEN do not
# trigger workflows, so auto-merge would wait forever under a ruleset).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TAG_REF="${1:-}"
BASE_BRANCH="${2:-main}"

if [[ -z "$TAG_REF" ]]; then
  echo "Usage: $0 vX.Y.Z [base-branch]" >&2
  exit 1
fi

if [[ ! "$TAG_REF" =~ ^v([0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
  echo "Tag must look like v1.4.1 (got: $TAG_REF)" >&2
  exit 1
fi
VERSION="${BASH_REMATCH[1]}"

case "$BASE_BRANCH" in
  main | dev) ;;
  *)
    echo "Refusing sync base branch '$BASE_BRANCH' (allowlist: main, dev). Falling back to main." >&2
    BASE_BRANCH=main
    ;;
esac

SYNC_BRANCH="chore/sync-version-${VERSION}-into-${BASE_BRANCH}"
TITLE="chore: sync app version to ${VERSION} from tag ${TAG_REF}"

if [[ -z "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]]; then
  echo "GH_TOKEN or GITHUB_TOKEN is required" >&2
  exit 1
fi
export GH_TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"
export HUSKY=0

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git fetch origin "$BASE_BRANCH"
git checkout -B "$SYNC_BRANCH" "origin/${BASE_BRANCH}"

# Locked Prettier before set-version (script refuses network `npx`).
if [[ ! -x "$ROOT/node_modules/.bin/prettier" ]]; then
  npm ci --ignore-scripts
fi

bash "$ROOT/scripts/ci/set-version-from-tag.sh" "$TAG_REF"

if git diff --quiet -- app.json package.json package-lock.json; then
  echo "Branch tip already at version $VERSION — checking for an open PR…"
else
  git add app.json package.json package-lock.json
  git commit -m "$TITLE"
fi

if git diff --quiet "origin/${BASE_BRANCH}"...HEAD -- app.json package.json package-lock.json; then
  echo "${BASE_BRANCH} already at version $VERSION — no sync PR."
  exit 0
fi

git fetch origin "$SYNC_BRANCH" || true
git push -u origin "$SYNC_BRANCH" --force-with-lease

PR_NUMBER="$(gh pr list --base "$BASE_BRANCH" --head "$SYNC_BRANCH" --state open --json number --jq '.[0].number // empty')"

if [[ -z "$PR_NUMBER" ]]; then
  BODY="$(
    cat <<EOF
Automated version sync after GitHub Release \`${TAG_REF}\`.

Target branch: \`${BASE_BRANCH}\` (from release \`target_commitish\`, or fallback \`main\`).

Updates:

- \`app.json\` \`expo.version\` → \`${VERSION}\`
- \`package.json\` / \`package-lock.json\` \`version\` → \`${VERSION}\`

Auto-merge is enabled when repository settings allow it; merges after required checks pass.
EOF
  )"
  set +e
  PR_URL="$(gh pr create --base "$BASE_BRANCH" --head "$SYNC_BRANCH" --title "$TITLE" --body "$BODY" 2>&1)"
  CREATE_STATUS=$?
  set -e
  if [[ "$CREATE_STATUS" -ne 0 || -z "$PR_URL" ]]; then
    echo "Failed to create sync PR:" >&2
    echo "$PR_URL" >&2
    exit 1
  fi
  echo "Opened PR: $PR_URL"
  PR_NUMBER="$(gh pr view "$PR_URL" --json number --jq .number)"
fi

if [[ -z "$PR_NUMBER" ]]; then
  echo "Sync PR number missing after create/list." >&2
  exit 1
fi

echo "Sync PR: #$PR_NUMBER (base ${BASE_BRANCH})"

set +e
MERGE_OUT="$(gh pr merge "$PR_NUMBER" --auto --squash 2>&1)"
MERGE_STATUS=$?
set -e

if [[ "$MERGE_STATUS" -eq 0 ]]; then
  echo "Auto-merge enabled for #$PR_NUMBER (squash when checks pass)."
  echo "$MERGE_OUT"
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    {
      echo "## Version sync"
      echo "PR #${PR_NUMBER} → \`${BASE_BRANCH}\`: auto-merge enabled."
    } >>"$GITHUB_STEP_SUMMARY"
  fi
  exit 0
fi

echo "$MERGE_OUT" >&2
echo "" >&2
echo "::warning::Could not enable auto-merge for sync PR #${PR_NUMBER} — merge manually if needed."
echo "Typical fixes:" >&2
echo "  1. Repo Settings → General → Pull Requests → enable “Allow auto-merge”." >&2
echo "  2. Add secret VERSION_SYNC_TOKEN (fine-grained PAT with contents+PRs) so CI runs on this PR;" >&2
echo "     the default GITHUB_TOKEN does not trigger workflows, so required checks never start." >&2
echo "  3. Or merge PR #$PR_NUMBER manually after checks (if any) are green." >&2
echo "  4. If base is ${BASE_BRANCH} with a ruleset requiring PRs/checks, ensure those can pass." >&2

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## Version sync"
    echo "PR #${PR_NUMBER} → \`${BASE_BRANCH}\` was opened, but **auto-merge was not enabled**."
    echo ""
    echo '```'
    echo "$MERGE_OUT"
    echo '```'
    echo ""
    echo "Store upload jobs are unaffected — check/merge this PR separately."
  } >>"$GITHUB_STEP_SUMMARY"
fi

# PR exists; store release succeeded. Soft-fail with visible warning/summary.
exit 0
