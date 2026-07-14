# Release CI — testing tracks (Play Internal + TestFlight)

Automated pipeline for **published GitHub Releases**: **local EAS production builds on GitHub-hosted runners** → submit to **Google Play Internal testing** and **TestFlight**. Binaries are **not** published as workflow/Release file assets (public repository).

A bare `git push` of a tag does **not** start this workflow.

## Trigger

| Event                                                 | Behavior                                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **GitHub Release → Publish** (`release: published`)   | Build Android + iOS from the release tag, submit to testing tracks, open version-sync PR |
| Same event with **Set as a pre-release**              | **Skipped** (`!github.event.release.prerelease` on the `validate` job)                   |
| Actions → **Release stores (testing)** → Run workflow | Manual retry; set existing `tag_override`, platform, optional `sync_branch`              |

Workflow: [`.github/workflows/release-stores.yml`](../.github/workflows/release-stores.yml)  
Environment: GitHub **`release`** (secrets). **Required before first run:** deployment branches/tags include `v*` (and `main`/`dev` if you use `workflow_dispatch`). Release events use `refs/tags/v…` — without this gate, jobs hang on environment protection or fail.

**Approvals:** `android`, `ios`, and `sync-version` all use `environment: release`. If the environment requires reviewers, each job needs its own approval (up to three per run). Prefer required reviewers only if that friction is acceptable; otherwise rely on secrets + deployment allowlist without reviewer gates.

## How to ship a testing release

1. Merge the code you want onto the branch you will target (`main` or `dev`).
2. GitHub → **Releases** → **Draft a new release**:
   - **Target**: that branch (becomes `target_commitish`)
   - **Tag**: `vX.Y.Z` (e.g. `v1.4.1`) — create tag on publish if needed
   - Publish release (not draft-only; do **not** check “Set as a pre-release” if you want this CI)
3. Workflow runs: builds the tagged commit → Play Internal + TestFlight → version sync PR into `target_commitish` (`main`/`dev` allowlist; otherwise **fallback `main`**).

```bash
# CLI equivalent
gh release create v1.4.1 --target dev --title "v1.4.1" --notes "…"
```

### Version sync

- User-facing version comes from the **tag name** (`v1.4.1` → `1.4.1` in `app.json` / `package.json` / lockfile for the build).
- After successful platform jobs, CI opens `chore/sync-version-…` → **`target_commitish`** when it is `main` or `dev`; SHA or unknown branch → **`main`**.
- Sync does **not** merge feature commits between branches — only version fields. Build content is whatever the **tag** points at.

`versionCode` / `buildNumber` still use EAS `autoIncrement` (remote).

### `workflow_dispatch`

Use for retries / single-platform rebuilds of an **already published** tag. Set `tag_override` and optionally `sync_branch` (`main`/`dev`). This does not create a Release.

### Credentials before first CI release

```bash
npm run build:ios -- --non-interactive
# and/or
npm run build:android -- --non-interactive
```

CI does **not** pass `--freeze-credentials`. After credentials are stable you may re-add freeze later.

### Auto-merge checklist (your side)

| Step                         | Where                                     |
| ---------------------------- | ----------------------------------------- |
| Enable **Allow auto-merge**  | Repo → Settings → General → Pull Requests |
| Add **`VERSION_SYNC_TOKEN`** | Environment `release` (recommended)       |

Why the PAT: default `GITHUB_TOKEN` commits do not trigger further workflows; required checks would never start. Fine-grained PAT: Contents R/W, Pull requests R/W, Metadata R — this repo only.

If sync base is `main` (ruleset + required checks), PAT + auto-merge matter most. Sync into `dev` may be lighter depending on branch rules.

## Secrets (`release` environment)

| Secret                                                        | Purpose                              |
| ------------------------------------------------------------- | ------------------------------------ |
| `EXPO_TOKEN`                                                  | Expo robot access token              |
| `ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_API_KEY_P8`, `ASC_APP_ID` | App Store Connect (iOS)              |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`                            | Play API (Android)                   |
| `GOOGLE_SERVICES_JSON`, `GOOGLE_SERVICE_INFO_PLIST`           | Firebase native configs              |
| `EXPO_PUBLIC_FIREBASE_*`                                      | Same as `.env` / `.env.example`      |
| `VERSION_SYNC_TOKEN`                                          | Recommended PAT for sync PR + checks |

Android-only / iOS-only dispatch validates only that platform’s **store** secrets. **Both** Firebase native secrets (`GOOGLE_SERVICES_JSON` and `GOOGLE_SERVICE_INFO_PLIST`) are still required on every platform job (including Android-only) — `app.config.js` / native configs expect both files.

CI secrets `GOOGLE_SERVICES_JSON` / `GOOGLE_SERVICE_INFO_PLIST` hold **file contents** (real newlines in the secret value, not literal `\n`). `prepare-store-credentials.sh` writes `./google-services.json` and `./GoogleService-Info.plist`, then re-exports those env names as **absolute paths** so `app.config.js` path overrides stay valid. `.ci/` is listed in `.easignore` so Play/ASC credential files never enter the EAS archive.

Do **not** add `EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION` unless you need an explicit override.

## Caching

- npm, vesum, Gradle (`actions/cache` on `~/.gradle`), CocoaPods
- Do **not** enable `setup-java` `cache: gradle` — the repo has no committed `gradle-wrapper.properties` (native Android appears only inside local EAS prebuild)
- `eas-cli` pinned (`eas-version: 21.0.0`)
- iOS: `macos-15` + Xcode **26.3** via `maxim-lobanov/setup-xcode` (Expo SDK 57 / `expo-modules-jsi` need Swift 6.2+; do **not** pin `'16'` — that selects Xcode 16.4)
- Optional `clear_cache` on workflow_dispatch

## Troubleshooting

| Symptom                                                                                      | Likely cause                                                                                | What to do                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Android fails at `setup-java` / gradle cache                                                 | No committed `gradle-wrapper.properties`                                                    | Ensure workflow tip has `cache: gradle` **removed**; retry via `workflow_dispatch` from `dev`/`main` (YAML from selected branch)               |
| iOS: `[CP-User] Build ExpoModulesJSI xcframework` + `Could not resolve package dependencies` | Wrong Xcode (e.g. 16.4). Nested SPM build needs Swift tools ≥ 6.2                           | Pin Xcode **26.3+** on the runner. Do **not** force `RCT_USE_PREBUILT_RNCORE=0` with `useFrameworks: static` (known Expo breakage)             |
| Retry of tag `vX.Y.Z` still uses old workflow bugs                                           | Tag commit embeds old YAML when release event runs from that tip; dispatch uses branch YAML | `workflow_dispatch` → choose branch with the fix → `tag_override=vX.Y.Z`; or cut a new patch release from a tip that includes the workflow fix |

## Local parity

```bash
# Build-style bump (no Prettier; Expo only needs the version numbers)
SKIP_PRETTIER=1 bash scripts/ci/set-version-from-tag.sh v1.4.1
bash scripts/ci/prepare-store-credentials.sh android
bash scripts/ci/prepare-store-credentials.sh ios
bash scripts/ci/release-build-submit.sh android
# Sync-style bump: npm ci first, then locked local Prettier (never network npx)
npm ci --ignore-scripts
bash scripts/ci/sync-version-to-branch.sh v1.4.1 dev
```

Submit profile in `eas.json`: **`testing`** → Play `internal`, iOS TestFlight.

## Checklist after merging this workflow

1. Allow auto-merge + `VERSION_SYNC_TOKEN`.
2. Environment `release` allows `v*` tags (and branches if you use dispatch); decide whether required reviewers are worth 3× approvals per run.
3. Both Firebase native file secrets set (even if you only ship Android first).
4. Publish a GitHub Release (not only `git push --tags`) on a commit that already includes this workflow.
5. Watch Actions + sync PR; install from Internal / TestFlight.
6. First Play API upload may still need one manual AAB historically.

## Out of scope (MVP)

- Auto-promote to production / App Store review
- Attaching AAB/IPA to the GitHub Release
- EAS cloud builds (free-tier queues)
