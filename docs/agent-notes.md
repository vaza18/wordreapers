# Agent session notes (rolling)

Short-lived observations from AI agent sessions — flaky tests, emulator quirks, temporary workarounds. **Not** the source of truth.

Promote important items to permanent docs (`known-issues.md`, `online-multiplayer-rules.md`, `decisions.md`) and delete stale notes here.

---

<!-- Add dated notes at the top -->

### 2026-07-17 — Selective CI: typecheck needs functions deps

- Root `npm run typecheck` runs `tsc -p tsconfig.node.json`, which includes `functions/src/**` and `lib/**`; `@types/node` resolves through the functions install. Without `npm ci --prefix functions`, typecheck fails (`Cannot find name 'node:fs'`, missing `firebase-admin`) across `functions/src`, `lib/dictionary`, and `tests`.
- Fix in `.github/workflows/ci.yml`: selective PR job sets `functions_ci=true` whenever `run_typecheck=true` (post-rule after category flags).
- Repro locally: `mv functions/node_modules aside && npm run typecheck` → same errors.

### 2026-07-17 — VirtualizedList warning: results lexicon gate

- RN warning `dt`/`prevDt` are scroll-event gaps, not render duration; needs `contentLength > 5× viewport`. Confirmed source: play `WordList` (~50 rows), not results; often false positive after pause between scrolls.
- Results: `resolveResultsWordListLexicon` keeps found-only list stable until «Показати всі можливі слова» is on (avoids rebuild when lexicon finishes).
- `ResultsGlobalWordList`: hoist `t`/theme out of each row.
- Test: `tests/round-playable-lexicon.test.ts`

### 2026-07-17 — WordList FlatList update cost (no UX change)

- Symptom: RN `VirtualizedList: large list that is slow to update` with ~60 accepted words (`dt` ~500ms+).
- Cause: full `map+sort` rebuilt every row object on accept; `renderItem` identity churned on prefix/entrance/highlight Sets.
- Change: `buildSortedWordListRows` reuses prior row identity + binary insert on single add; stable `renderItem` via snapshot ref + `extraData`.
- Test: `tests/word-list-rows.test.ts`

### 2026-07-17 — Training Firebase / App Check Invalid (production)

- Production Android (Play Integrity): paused training resume/finish correlated with Auth/RTDB **Invalid** App Check metrics while enforcement still off.
- Code fix: short-circuit `abandonOrganizerWaitingRoomForDraft` before Auth; reject empty App Check tokens; gate presence + public lobby browse. See `docs/known-issues.md`.
- Manual smoke (narrow): (1) clean app data → training pause/resume/finish → no Auth spike; (2) setup→solo without publish; (3) invite/publish from solo still works; (4) browse/join → Verified. Sync coordinator may still hit Firebase if non-solo archives exist on device.

### 2026-07-16 — Release CI: iOS ExpoModulesJSI Swift 6.3 requirement

- Symptom: after the deps bump (`222e87d`, `expo` `^57.0.0` → `~57.0.6` → `expo-modules-jsi@57.0.3`), iOS archive fails compiling `expo-modules-jsi` (`JavaScriptCodable+Date.swift:53` `type of expression is ambiguous`).
- Cause: SDK 57 `expo-modules-jsi` needs Swift **6.3** (Xcode 26.4+). Runner was `macos-15` pinned to Xcode 26.3 (Swift 6.2), which tops out that image. Not app code; not a patch-package case (Expo maintainers advise against patching, issue #46242).
- Fix: `runs-on: macos-26` + `xcode-version: '26.4'`. Fastlane vendor cache auto-rebuilds via Ruby-version stamp on the new image.

### 2026-07-16 — Release CI: Fastlane `libruby` mismatch after Ruby patch

- Symptom: iOS `eas build --local` → `fastlane --version` exit 1; `json` gem `linked to incompatible …/Ruby/3.3.11/…/libruby.3.3.dylib` while runner is 3.3.12.
- Cause: `actions/cache` key for `scripts/ci/vendor` used only `Gemfile.lock`; `ruby/setup-ruby` floated `3.3` → new patch; restored native gems from previous patch. Not an app-code regression.
- Fix: cache key includes resolved `RUBY_VERSION`; `ensure-fastlane.sh` stamps + rebuilds on mismatch. See `docs/release-ci.md` troubleshooting.

### 2026-07-16 — Android lexicon build perf (client-only)

- Root fix kept: `DictionaryIndex` O(1) `Set` + `Intl.Collator('uk')` sort (+ commit-only setup prefetch). Speculative letter-mask / preferFastWallClock experiments reverted.
- Verified ~3–6s for 5773 accepts on S931B (`yieldEveryMs` 64). No play/solo blocking spinner — lexicon builds in background while the screen mounts; word submit already has ~1s debounce.
- iOS suggest / setup hint: typing uses soft `pause` (no cache eviction); deferred `onPressOut` clear keeps suppress until `onPress`.

### 2026-07-15 — Dead code cleanup

- Removed orphan modules (`leave-organizer-setup`, `session-participants`, unused `lib/game` barrel), unused exports (`PlusIcon`, `Stepper`, `withButtonFeedback`, …), and four test-only `lib/online` helpers (`resolve-rematch-navigation-route`, `restore-finished-round-to-firebase`, `sum-archived-word-count`, `voting-player-ids`) plus their dedicated tests. Pruned ~46 unused `uk.json` keys. No runtime behavior change.

### 2026-07-15 — Rematch starter solo UI after invite joins

- Room `6DGFA` rematch: `uniqueBonusEnabled: false` in RTDB with 3 `liveRoundPlayerUids` — latch update aborted by full `players` rewrite. Starter alone at round start kept solo UI. Fix: leaf score patches + hasMultiplayerRound online-peer fallback.

### 2026-07-15 — Last-second add-time propose freeze

- Symptom: proposer closes minute picker at 00:00; peers already finished; no vote; proposer frozen with no «Гру завершено».
- Fix path: await propose before close; finish-on-dismiss helpers in `add-time-vote.ts`; time-up only when picker closed. See `known-issues.md`.

### 2026-07-15 — Revert iOS input-lag “optimizations”

- User: hangs mid-word without toasts (e.g. «ЛЕЛЕ» last letter delayed seconds). Confirmed not toast-root. Pre-change iOS was fine; Android 100+ training was the original bug.
- Action: reverted compose island / contention store / deferred+transition experiments on play path. Kept `buildSoloWordListDisplay` memo + WordList Fabric row slots.
- Follow-up: «КОЛООН» + «Недоступні літери» — base word has only 2×О; extra О from lag/double-press before used-keys re-render. Debounce word-list `draftPrefix`; sync `draftKeyIndicesRef` on press.
- Lesson: on RN/iOS do not put `useDeferredValue` / `startTransition` beside draft; speculative isolation can regress more than it helps.

### 2026-07-15 — Release CI: `Could not find command "_2.6.9_"`

- After `vendor/bin` on PATH, a shell `bundle(){ bundle _2.6.9_ "$@"; }` hit a vendored `bundle` stub → `_2.6.9_` treated as a subcommand. Fix: absolute Bundler binary + invoke `fastlane` from PATH (not `bundle exec`).
- Also: bundletool download progress must go to stderr or it pollutes Play `--version_name`.

### 2026-07-15 — Release CI: iOS `spawn fastlane ENOENT`

- Local `eas build --platform ios` needs `fastlane` on PATH during the native build, not only for TestFlight upload. Install + binstubs via `ensure-fastlane.sh` before `eas build`.

### 2026-07-15 — Release CI: AAB overwritten + Bundler 1.x

- Local EAS `--output wordreapers.aab` + `buildArtifactPaths: mapping.txt` rewrote the AAB as ASCII mapping (~71MB `file: ASCII text`). Drop `buildArtifactPaths` from production when CI uses a single-file `--output`.
- `Gemfile.lock` `BUNDLED WITH 1.17.2` made Bundler 4 install 1.17.2 → `undefined method untaint` on Ruby 3.3. Lock to Bundler 2.6.9 + `ruby/setup-ruby` in the workflow.

### 2026-07-14 — Submit latency: parallel wordSet + single increment

- Shipped ADR-013. Profiler marks: `shardParentGet`, `sessionGet`, `sessionIncrement` / `sessionDualTx`, `wordSet` (may interleave).
- Remaining 5+ same-word race (two first-finders both +2) is unchanged — needs parent `wordPlayers/{word}` transaction or CF later; do **not** use increment for demotion.
