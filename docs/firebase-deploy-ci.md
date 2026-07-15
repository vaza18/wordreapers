# Firebase backend CI deploy (RTDB rules + Cloud Functions)

Deploys **Realtime Database security rules** and/or **Cloud Functions** from CI. Store app uploads stay in [`release-ci.md`](release-ci.md); this doc covers backend-only flows and the backend gate before Play / TestFlight jobs.

**Never** deploys on push or merge to `main` / `dev`. Backend ahead of already-shipped store clients can break live games.

Workflow: [`.github/workflows/deploy-firebase.yml`](../.github/workflows/deploy-firebase.yml)  
Used by: manual dispatch + [`.github/workflows/release-stores.yml`](../.github/workflows/release-stores.yml) (`backend` job before `android` / `ios`)  
Environment: GitHub **`release`** (same as store jobs)

## Triggers

| Event                                                                                    | Behavior                                                |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Actions → **Deploy Firebase backend** → Run workflow                                     | Manual hotfix / repair; apps need not rebuild           |
| **GitHub Release** published (non–pre-release) or **Release stores** `workflow_dispatch` | `backend` runs after `validate`, **before** android/ios |
| Push to `main` / `dev`                                                                   | **No** backend deploy                                   |

```text
validate → backend (deploy or no-op) → android ‖ ios → sync-version
```

`backend` must **succeed** (including no-op) for store jobs to start. Failed tests or deploy **blocks** store uploads.

If environment `release` requires reviewers, the nested backend `deploy` job is an extra approval (up to four per full release run with android + ios + sync). Manual dispatch from a branch/tag **outside** the environment deployment allowlist can hang on protection until the ref is allowed or the run is cancelled.

**Manual hotfix blast radius:** dispatch from `main`/`dev` with `target=auto` can deploy production backend deltas without a GitHub Release whenever those branches are allowed on environment `release`. Prefer tip-matching `v*` tags for intentional hotfixes, required reviewers on `release`, and/or restricting the environment deployment allowlist to `v*` (and using `force` only when repairing).

## Pre-merge / first-use checklist

Before the first Release (or manual dispatch) that would **actually** deploy backend:

1. Add `FIREBASE_SERVICE_ACCOUNT_JSON` to environment `release` (Firebase Admin SA — not the Play SA).
2. Smoke once: Actions → **Deploy Firebase backend** → `force=true`, `target=both` (or one-sided `rules` / `functions`).
3. Prefer environment deployment allowlist **`v*`** for production; only allow `main`/`dev` if you accept manual hotfix blast radius (see above).
4. Keep every reusable-workflow caller on `secrets: inherit` (do not drop it).
5. **One Release at a time** (publish/finish in semver order). Store + Firebase concurrency groups serialize runs but do **not** sort by version — overlapping Releases can still deploy an older backend after a newer one if you start them out of order.

### Cutover: retrying tags created before this gate

`release-stores` `tag_override` / Release jobs check out the **tag tip** and run `scripts/ci/detect-…` / deploy scripts from **that tree**. Tags cut **before** this Firebase gate landed do not contain these scripts (or have older logic). Retrying such a tag after merge will break the backend job even if store uploads used to work.

**Do not** retry pre-gate tags for a full Release stores run. Options: cut a new patch release from a tip that includes this gate, or use **Deploy Firebase backend** manually from a branch that has the scripts (with an explicit tip-matching `v*` if needed). Same class of issue as YAML-from-tag for store workflow fixes — see [`release-ci.md`](release-ci.md) troubleshooting.

## Change detection

Paths that count as backend:

- `firebase/**` → database rules (any file under `firebase/`, so renames of the rules file still redeploy)
- `firebase.json` → **both** rules and functions (configures database rules path and functions predeploy/source)
- `functions/**` → functions
- `scripts/dictionary/**` → functions (intentional **broad** tradeoff: any change under the dictionary pipeline triggers CF deploy so prod Functions stay aligned with whitelist/vesum pins that feed `functions` `build` → generated `base_words`. Prefer this over silent under-deploy; narrow later if noisy.)

Ignored for project selection: there is no committed `.firebaserc` — deploy always uses `--project "$EXPO_PUBLIC_FIREBASE_PROJECT_ID"` from env/CI (see `scripts/firebase-deploy.sh`).

### How the previous tag is chosen

| Mode                                 | When                                                             | Previous tip                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Release / `--version-tag vX.Y.Z`** | Always on store releases (`release-stores` passes `version_tag`) | Tag must **point at the checked-out tip** (or `--force` skips baseline). Previous tip = newest **older** semver `v*` that is an **ancestor** of tip (skips hotfix tags on unrelated branches). If no older tags → first release. If older tags exist but none are ancestors → **fail** unless `--force`. |
| **No `--version-tag`**               | Manual runs that omit it                                         | Newest ancestor `v*` of `CURRENT_SHA`, skipping self-tags. Non-ancestor-only history **fails** unless `--force`.                                                                                                                                                                                         |

| Situation                                                | Result                                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| No changes on those paths                                | Job **succeeds as no-op** (does not skip; `needs:` stays green). No-op still takes the concurrency lock and may require environment approval. |
| No previous `v*` tag (first release / sole tag)          | Treat as changed → deploy requested targets                                                                                                   |
| Unknown `--version-tag`                                  | **Fail** (refuse over-deploy); do not treat as first release                                                                                  |
| No ancestor older `v*` (with or without `--version-tag`) | Older tags exist but none are ancestors of CURRENT → **Fail** unless `--force`                                                                |
| Only rules changed                                       | Deploy database rules only                                                                                                                    |
| Only `firebase.json` changed                             | Deploy rules **and** functions                                                                                                                |
| Only `functions/**` or `scripts/dictionary/**` changed   | Deploy functions only                                                                                                                         |
| Both path groups changed                                 | Deploy **sequentially**: rules first, then functions (never parallel)                                                                         |

If rules succeed and functions then fail, **rules stay live** in prod while the job (and store uploads) fail. Recovery: re-run **Deploy Firebase backend** with `force=true` and `target=functions` (or `both`). CI emits `::warning::` after rules when functions are still pending.

`git diff` failures fail the job (fail closed) — they are not treated as an empty no-op.

Script: [`scripts/ci/detect-firebase-backend-changes.sh`](../scripts/ci/detect-firebase-backend-changes.sh)

## Concurrency and reusable-workflow secrets

- **Concurrency group** `deploy-firebase-production` (`cancel-in-progress: false`) — one backend deploy at a time for the shared Firebase project, whether from manual hotfix or a Release. Prevents overlapping rules/functions deploys from different refs.
- Callers must use **`secrets: inherit`** (see `release-stores.yml`). For reusable workflows this is required so environment `release` secrets resolve; without inherit they can become empty strings even when the nested job sets `environment: release`.

## Manual dispatch inputs

| Input          | Meaning                                                                                                                                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`       | `auto` (from diff), `rules`, `functions`, or `both`. **Without `force`, `both` ≡ `auto`** (selective). Use `force` to always deploy both.                                                                                                                                                             |
| `force`        | When `true`, deploy even if the diff is empty / baseline skipped. **`force` + `auto`/`both` always redeploys both sides** (conscious trade-off — not “force only what changed”). One-sided repair: `force` + `rules` or `force` + `functions`.                                                        |
| `checkout_ref` | Optional git ref (empty = branch chosen for the run)                                                                                                                                                                                                                                                  |
| `version_tag`  | Optional `vX.Y.Z`. When set, the tag must **point at the checked-out tip** (release-stores always does). Unknown tags **fail**. A tag that is only an older ancestor of tip (tip moved ahead) **fails** without `--force` (avoids wrong baseline / over-deploy); with `--force`, baseline is skipped. |

Examples:

- Repair console drift: `force=true`, `target=both` (or `rules` / `functions` alone).
- Hotfix rules only after a bad console edit: `force=true`, `target=rules`.

## Validation gates (fail closed)

Shared when either target deploys: root `npm ci` (vesum cache restored first).

| Deploy target | Before deploy                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rules         | `npm run test:rules`                                                                                                                             |
| Functions     | `npm ci --prefix functions`, then `npm run typecheck`, then `npm --prefix functions run build` (root `npm ci` still runs — needed for typecheck) |

Deploy uses [`scripts/ci/firebase-deploy-ci.sh`](../scripts/ci/firebase-deploy-ci.sh) → `npm run firebase:deploy:rules` / `firebase:deploy:functions` (via [`scripts/firebase-deploy.sh`](../scripts/firebase-deploy.sh)).

CI runners use **Node 22** (same as `.github/workflows/ci.yml`). `functions/package.json` `engines.node` is **20** (Cloud Functions runtime). Local/CI typecheck+build on Node 22 is intentional parity with the rest of the repo.

The workflow builds functions once as a gate; `firebase.json` `predeploy` builds again during `firebase deploy` — accepted double build.

npm script **names** are unchanged (same targets for local and CI):

```bash
npm run firebase:deploy:rules
npm run firebase:deploy:functions
npm run firebase:deploy:backend   # both; prefer sequential CI path for CI
```

[`scripts/firebase-deploy.sh`](../scripts/firebase-deploy.sh) behavior (used by those scripts):

- An already-exported `EXPO_PUBLIC_FIREBASE_PROJECT_ID` **wins over** `.env` (CI-safe). A stale export in a local shell can silently target the wrong project — `unset` it when debugging against `.env`.
- With `GOOGLE_APPLICATION_CREDENTIALS` pointing at a service account JSON, the script uses ADC and passes `--non-interactive`. Without ADC, local `firebase login` / existing CLI credentials still work (interactive prompts allowed).

## Secrets and IAM

Add to GitHub Environment **`release`** (do **not** reuse `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`):

| Secret                            | Purpose                                                         |
| --------------------------------- | --------------------------------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT_JSON`   | Full JSON key of a GCP service account that can deploy Firebase |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | Already required for store jobs; same production project        |

### Create the service account

1. Google Cloud Console → select the Firebase / GCP project (`EXPO_PUBLIC_FIREBASE_PROJECT_ID`).
2. **IAM & Admin → Service Accounts → Create**.
3. Grant role **Firebase Admin** (`roles/firebase.admin`) — sufficient for `firebase deploy --only database,functions` in CI.
4. Keys → **Add key → JSON**; copy the file contents into the GitHub secret (real JSON, not a path).
5. Do not commit the JSON. Rotate if leaked.
6. **Smoke once:** Actions → Deploy Firebase backend → `force=true`, `target=both` (or `rules` / `functions`). Confirm success before relying on a Release gate.

Granular roles (optional later): Realtime Database Admin, Cloud Functions Admin, Service Account User, Cloud Build Editor, Artifact Registry Writer — Firebase Admin is the documented MVP.

CI writes the secret to a temp file under `$RUNNER_TEMP` and sets `GOOGLE_APPLICATION_CREDENTIALS`. Logs must never print the JSON.

## Breaking-change policy (two-wave)

1. **Additive first** — new optional fields, looser-then-tighten carefully, new functions that old clients ignore.
2. **Compatible client in testing tracks** — ship store builds (Play Internal / TestFlight) that understand the new backend **before** or **immediately with** a release that deploys breaking rules/functions.
3. **Breaking removals later** — only after clients on testing (and ideally production) no longer require the old shape.
4. **No merge-to-main auto-deploy** — merging backend changes to `main` does not update production Firebase. Production updates happen via Release / manual deploy workflow only.

Shipping breaking rules/functions while old store builds are still live is a product incident, not a CI footgun we automate around.

## Troubleshooting

| Symptom                                          | Likely cause                                                          | What to do                                                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Auth / permission errors on deploy               | Missing or wrong SA; Play SA reused; role too weak                    | Set `FIREBASE_SERVICE_ACCOUNT_JSON`; grant Firebase Admin; smoke with `force=true`                                            |
| Job no-op but you expected deploy                | Diff empty vs previous `v*` tag                                       | `force=true`; confirm changes under `firebase/`, `firebase.json`, `functions/**`, or `scripts/dictionary/**`                  |
| Retry same release tag redeploys backend         | Diff vs previous `v*` still shows backend paths                       | Expected; use a commit with no backend delta for no-op, or accept idempotent redeploy                                         |
| Older backend wins after newer Release           | Two Releases overlapped; concurrency queues by start time, not semver | Publish/finish **one Release at a time** in version order; see checklist item 5                                               |
| Rules in prod, functions failed (stores blocked) | Sequential deploy; rules finished before functions error              | Re-run with `force=true` and `target=functions` (or `both`). CI emits `::warning::` after rules when functions still pending. |
| Unknown `--version-tag` / tip mismatch           | Tag missing, not tip, or not an ancestor of CURRENT                   | Use tip-matching `vX.Y.Z` (release does); or omit `version_tag`; or `--force`                                                 |
| No ancestor older `v*` tag                       | Older tags exist but none are ancestors of CURRENT                    | Ensure history is connected; or dispatch with `force=true`                                                                    |
| `test:rules` failed                              | Rules regression                                                      | Fix locally with `npm run test:rules`; do not force-deploy past the gate                                                      |
| Typecheck / functions `build` failed             | TS or dict copy error in `functions/`                                 | Fix, then re-run; deploy step never runs if gates fail                                                                        |
| Store android/ios skipped / blocked              | Backend job failed                                                    | Fix backend deploy/tests; no-op success is enough for apps when unchanged                                                     |
| Workflow waiting on approval / never starts      | Environment reviewers, or ref not on `release` allowlist              | Approve jobs; ensure deployment branches/tags include `v*` / `main` / `dev` as needed                                         |
| Parallel deploy failures locally                 | Known flaky when rules+functions in one parallel attempt              | CI always runs rules then functions; locally prefer sequential npm scripts                                                    |

## Local parity

```bash
# Detect only (needs full tag history)
bash scripts/ci/detect-firebase-backend-changes.sh \
  --current-ref HEAD --version-tag v1.4.1 --target auto --force false

# CI-style deploy (requires SA JSON in env — do not commit)
export EXPO_PUBLIC_FIREBASE_PROJECT_ID=…
export FIREBASE_SERVICE_ACCOUNT_JSON="$(cat /path/to/sa.json)"
export DEPLOY_RULES=true DEPLOY_FUNCTIONS=false
bash scripts/ci/firebase-deploy-ci.sh
```
