# Release CI — testing tracks (Play Internal + TestFlight)

Automated pipeline for **published GitHub Releases**:

1. **Firebase backend gate** — RTDB rules and/or Cloud Functions when those paths changed since the previous `v*` tag (or no-op). See [`firebase-deploy-ci.md`](firebase-deploy-ci.md).
2. **Local EAS production builds** on GitHub-hosted runners (`eas build --local`) — uses Expo only for the native build toolchain / credentials, not cloud build queues.
3. **Direct store upload** via Fastlane (**no `eas submit`**, no Expo Submit Free Tier Queue):
   - Android → Google Play Internal (`fastlane supply`)
   - iOS → TestFlight (`fastlane pilot`)

Binaries are **not** published as workflow/Release file assets (public repository).

A bare `git push` of a tag does **not** start this workflow.
Backend does **not** deploy on push/merge to `main`/`dev` (only Release flow or manual Deploy Firebase).

Store workflow concurrency is global (`release-stores-production`): overlapping Releases queue rather than run in parallel. Still publish **one Release at a time** in semver order — the queue is not version-sorted. See [`firebase-deploy-ci.md`](firebase-deploy-ci.md).

## Trigger

| Event                                                 | Behavior                                                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **GitHub Release → Publish** (`release: published`)   | Deploy Firebase backend if needed → build Android + iOS from the release tag → testing tracks → version-sync PR |
| Same event with **Set as a pre-release**              | **Skipped** (`!github.event.release.prerelease` on the `validate` job)                                          |
| Actions → **Release stores (testing)** → Run workflow | Manual retry; set existing `tag_override`, platform, optional `sync_branch` (still runs backend gate)           |
| Actions → **Deploy Firebase backend** → Run workflow  | Backend-only hotfix; see [`firebase-deploy-ci.md`](firebase-deploy-ci.md)                                       |

Workflow: [`.github/workflows/release-stores.yml`](../.github/workflows/release-stores.yml)  
Backend deploy: [`.github/workflows/deploy-firebase.yml`](../.github/workflows/deploy-firebase.yml) → [`docs/firebase-deploy-ci.md`](firebase-deploy-ci.md)  
Environment: GitHub **`release`** (secrets). **Required before first run:** deployment branches/tags include `v*` (and `main`/`dev` if you use `workflow_dispatch`). Release events use `refs/tags/v…` — without this gate, jobs hang on environment protection or fail.

### Quality CI before release

The `CI` workflow is selective on pull requests and full on `main`:

- PRs to any base branch run only checks relevant to changed files.
- Direct pushes to `dev` do not run GitHub Actions CI; use local `npm run ci:check` before pushing meaningful code.
- Every push/merge to `main` runs the full suite (`dict:validate`, lint, Prettier, typecheck, coverage, and RTDB rules).
- Automated version-sync PRs that only touch `app.json`, `package.json`, and `package-lock.json` run root `npm ci` plus Prettier before auto-merge; the post-merge `main` run provides the full quality signal.

**Approvals:** `backend` (nested deploy job in the reusable workflow), `android`, `ios`, and `sync-version` all use `environment: release`. If the environment requires reviewers, each job needs its own approval (up to four per full run). Prefer required reviewers only if that friction is acceptable; otherwise rely on secrets + deployment allowlist without reviewer gates.

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

**Cutover:** tags published **before** the Firebase backend gate must **not** be retried via `tag_override` for a full stores run — the job checkouts the tag tip and runs detect/deploy scripts from that tree (missing or outdated). Use a new patch release from a tip that includes the gate, or backend-only deploy from a branch that has the scripts. See [`firebase-deploy-ci.md`](firebase-deploy-ci.md).

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

| Secret                                                        | Purpose                                                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `EXPO_TOKEN`                                                  | Expo robot access token (local EAS)                                                                             |
| `ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_API_KEY_P8`, `ASC_APP_ID` | App Store Connect (TestFlight)                                                                                  |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`                            | Play API (Internal track)                                                                                       |
| `FIREBASE_SERVICE_ACCOUNT_JSON`                               | Firebase deploy (rules + functions); **not** the Play SA — see [`firebase-deploy-ci.md`](firebase-deploy-ci.md) |
| `GOOGLE_SERVICES_JSON`, `GOOGLE_SERVICE_INFO_PLIST`           | Firebase native configs                                                                                         |
| `EXPO_PUBLIC_FIREBASE_API_KEY`                                | Firebase Web API key (client)                                                                                   |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`                            | Firebase Auth domain                                                                                            |
| `EXPO_PUBLIC_FIREBASE_DATABASE_URL`                           | RTDB URL                                                                                                        |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID`                             | Firebase project id                                                                                             |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`                         | Storage bucket                                                                                                  |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`                    | FCM sender id                                                                                                   |
| `EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID`                         | Android Firebase app id (android store job only)                                                                |
| `EXPO_PUBLIC_FIREBASE_APP_ID_IOS`                             | iOS Firebase app id (ios store job only)                                                                        |
| `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID`                         | Analytics measurement id (optional)                                                                             |
| `VERSION_SYNC_TOKEN`                                          | Recommended PAT for sync PR + checks                                                                            |

Android-only / iOS-only dispatch validates only that platform’s **store** secrets. **Both** Firebase native secrets (`GOOGLE_SERVICES_JSON` and `GOOGLE_SERVICE_INFO_PLIST`) are still required on every platform job (including Android-only) — `app.config.js` / native configs expect both files. The **backend** gate still runs for android-only/ios-only retries: if backend paths changed since the previous `v*` tag, `FIREBASE_SERVICE_ACCOUNT_JSON` is required even when you are not uploading the other store.

CI secrets `GOOGLE_SERVICES_JSON` / `GOOGLE_SERVICE_INFO_PLIST` hold **file contents** (real newlines in the secret value, not literal `\n`). `prepare-store-credentials.sh` writes `./google-services.json` and `./GoogleService-Info.plist`, then re-exports those env names as **absolute paths** so `app.config.js` path overrides stay valid. `.ci/` is listed in `.easignore` so Play/ASC credential files never enter the EAS archive.

Do **not** set `EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION` in GitHub secrets unless overriding — the EAS `production` profile already sets it to `true` in [`eas.json`](../eas.json) (must be `EXPO_PUBLIC_*` so Metro inlines it). Preview sets `false` (debug provider).

**App ids:** JS SDK must use the **platform** Firebase app id (Android or iOS), matching `google-services.json` / `GoogleService-Info.plist` — not the web app. GitHub Environment `release` secrets: `EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID` (android job) and `EXPO_PUBLIC_FIREBASE_APP_ID_IOS` (ios job). Each store job only requires its own platform id. Do **not** hardcode ids in source/`eas.json`, and do **not** use a web `EXPO_PUBLIC_FIREBASE_APP_ID` fallback — see [`docs/decisions.md`](decisions.md) ADR-016 and [`.cursor/rules/no-legacy-code.mdc`](../.cursor/rules/no-legacy-code.mdc).

## Store upload (direct)

| Script                                                                          | Tool            | Target          |
| ------------------------------------------------------------------------------- | --------------- | --------------- |
| [`scripts/ci/submit-android-play.sh`](../scripts/ci/submit-android-play.sh)     | Fastlane Supply | Play `internal` |
| [`scripts/ci/submit-ios-testflight.sh`](../scripts/ci/submit-ios-testflight.sh) | Fastlane Pilot  | TestFlight      |

Play release **name** is set to `{versionCode} ({versionName})` from the AAB (e.g. `53 (1.4.0)`), via Supply `--version_name`. Override with `PLAY_RELEASE_NAME` if needed.

Fastlane is installed from [`scripts/ci/Gemfile`](../scripts/ci/Gemfile) (`ensure-fastlane.sh`). CI does **not** call `eas submit`.

## Caching

- npm, vesum, Gradle (`actions/cache` on `~/.gradle`), CocoaPods, Fastlane gems (`scripts/ci/vendor`)
- Both store jobs use `ruby/setup-ruby` (Ruby 3.3 + Bundler **2.6.9**) before Fastlane
- Fastlane vendor cache key includes the **resolved Ruby patch** (`ruby -e 'print RUBY_VERSION'`) plus `Gemfile.lock` — native gems link `libruby` and break across 3.3.x patches if the key omits it
- `ensure-fastlane.sh` stamps `scripts/ci/vendor/.ruby-version-stamp` and rebuilds when the stamp mismatches (or `fastlane --version` fails)
- iOS: Fastlane binstubs must be on `PATH` **before** local `eas build` (EAS spawns `fastlane` during the archive)
- Do **not** enable `setup-java` `cache: gradle` — the repo has no committed `gradle-wrapper.properties` (native Android appears only inside local EAS prebuild)
- `eas-cli` pinned (`eas-version: 21.0.0`)
- iOS: `macos-26` + Xcode **26.4** via `maxim-lobanov/setup-xcode` (Expo SDK 57 `expo-modules-jsi` needs Swift **6.3** → Xcode 26.4+, only on `macos-26`; `macos-15` tops out at 26.3/Swift 6.2 and fails to compile ExpoModulesJSI; do **not** pin `'16'` — that selects Xcode 16.4)
- Optional `clear_cache` on workflow_dispatch

## Troubleshooting

| Symptom                                                                                                                           | Likely cause                                                                                                            | What to do                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android fails at `setup-java` / gradle cache                                                                                      | No committed `gradle-wrapper.properties`                                                                                | Ensure workflow tip has `cache: gradle` **removed**; retry via `workflow_dispatch` from `dev`/`main` (YAML from selected branch)                          |
| iOS: `[CP-User] Build ExpoModulesJSI xcframework` + `Could not resolve package dependencies`                                      | Wrong Xcode (e.g. 16.4). Nested SPM build needs Swift tools ≥ 6.2                                                       | Pin Xcode **26.4+** on the runner. Do **not** force `RCT_USE_PREBUILT_RNCORE=0` with `useFrameworks: static` (known Expo breakage)                        |
| iOS: ExpoModulesJSI Swift error `type of expression is ambiguous without a type annotation` (e.g. `JavaScriptCodable+Date.swift`) | Runner Xcode too old (26.3/Swift 6.2). SDK 57 `expo-modules-jsi` needs Swift 6.3                                        | Use `runs-on: macos-26` + `xcode-version: '26.4'`. `macos-15` cannot satisfy this. Do **not** patch node_modules (Expo maintainers advise against it)     |
| Retry of tag `vX.Y.Z` still uses old workflow bugs                                                                                | Tag commit embeds old YAML when release event runs from that tip; dispatch uses branch YAML                             | `workflow_dispatch` → choose branch with the fix → `tag_override=vX.Y.Z`; or cut a new patch release from a tip that includes the workflow fix            |
| Retry pre-Firebase-gate tag fails backend job                                                                                     | Tag tip lacks `scripts/ci/detect-firebase-…` / deploy-ci                                                                | New patch release from tip with the gate; or manual Deploy Firebase from a branch with the scripts — see [`firebase-deploy-ci.md`](firebase-deploy-ci.md) |
| AAB fails local validation; `file` says `ASCII text`                                                                              | `buildArtifactPaths` (e.g. `mapping.txt`) overwritten `--output` `.aab`                                                 | Production profile must not set `buildArtifactPaths` when CI uses a single-file `--output`                                                                |
| AAB fails local validation (`BundleConfig.pb` / manifest missing)                                                                 | `--output` is not a real App Bundle                                                                                     | Check `applicationArchivePath` in `eas.json`; inspect `file` / `unzip -l` in logs                                                                         |
| Fastlane: `undefined method 'untaint'` / Bundler 1.17.2                                                                           | `Gemfile.lock` `BUNDLED WITH 1.x` on Ruby 3.2+                                                                          | Lockfile must be `BUNDLED WITH` 2.x; `ensure-fastlane.sh` pins bundler 2.6.9                                                                              |
| iOS local EAS: `spawn fastlane ENOENT`                                                                                            | Fastlane only installed for upload; EAS spawn needs `fastlane` on PATH during the build                                 | `release-build-submit.sh` sources `ensure-fastlane.sh` **before** `eas build` on iOS; binstubs in `scripts/ci/vendor/bin`                                 |
| `Could not find command "_2.6.9_"`                                                                                                | Shell `bundle()` wrapper + `vendor/bin` on PATH made `_2.6.9_` a subcommand                                             | Use absolute Bundler 2.6.9 binary; call `fastlane` from PATH (not `bundle exec`)                                                                          |
| iOS: `linked to incompatible …/libruby.3.3.dylib` / `fastlane --version` exit 1                                                   | Fastlane `vendor/` cache restored from another Ruby **patch** (e.g. 3.3.11 → 3.3.12)                                    | Cache key must include Ruby patch; `ensure-fastlane.sh` clears vendor on stamp mismatch. Retry release after merging the workflow fix                     |
| Play `supply` auth / permission errors                                                                                            | Service account not linked in Play Console or missing Release to testing tracks permission                              | Play Console → Users and permissions → grant the SA; first AAB historically may need one manual upload                                                    |
| Pilot / ASC API errors                                                                                                            | Bad key, wrong `ASC_APP_ID`, or API key lacks App Manager / Developer access                                            | Verify `.p8` + key/issuer; TestFlight access for the key’s role                                                                                           |
| App Check Console **100% Invalid** after store release                                                                            | Debug provider in release JS (missing `EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION`) or web `appId` vs native Android/iOS | Confirm `eas.json` production env; ship hotfix; compare Play App Signing SHA-256 with Firebase Android SHA list; do not Enforce yet                       |
| Expo dashboard shows Submit “Free Tier Queue”                                                                                     | Something still called `eas submit`                                                                                     | CI must use Fastlane scripts above — do not reintroduce `eas submit`                                                                                      |

## Local parity

```bash
# Build-style bump (no Prettier; Expo only needs the version numbers)
SKIP_PRETTIER=1 bash scripts/ci/set-version-from-tag.sh v1.4.1
bash scripts/ci/prepare-store-credentials.sh android
bash scripts/ci/prepare-store-credentials.sh ios
bash scripts/ci/release-build-submit.sh android
# Or upload only:
# bash scripts/ci/submit-android-play.sh .ci/artifacts/wordreapers.aab
# ASC_KEY_ID=… ASC_ISSUER_ID=… bash scripts/ci/submit-ios-testflight.sh .ci/artifacts/wordreapers.ipa
# Sync-style bump: npm ci first, then locked local Prettier (never network npx)
npm ci --ignore-scripts
bash scripts/ci/sync-version-to-branch.sh v1.4.1 dev
```

## Checklist after merging this workflow

1. Allow auto-merge + `VERSION_SYNC_TOKEN`.
2. Environment `release` allows `v*` tags (and branches if you use dispatch); decide whether required reviewers are worth 4× approvals per full run (backend deploy + android + ios + sync).
3. Both Firebase native file secrets set (even if you only ship Android first).
4. Add `FIREBASE_SERVICE_ACCOUNT_JSON` (Firebase Admin SA for the production project — not the Play SA). See [`firebase-deploy-ci.md`](firebase-deploy-ci.md).
5. Publish a GitHub Release (not only `git push --tags`) on a commit that already includes this workflow.
6. Watch Actions + sync PR; install from Internal / TestFlight.
7. First Play API upload may still need one manual AAB historically.

## Out of scope (MVP)

- Auto-promote to production / App Store review
- Attaching AAB/IPA to the GitHub Release
- EAS cloud builds and EAS Submit (free-tier queues)
