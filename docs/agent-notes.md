# Agent session notes (rolling)

Short-lived observations from AI agent sessions — flaky tests, emulator quirks, temporary workarounds. **Not** the source of truth.

Promote important items to permanent docs (`known-issues.md`, `online-multiplayer-rules.md`, `decisions.md`) and delete stale notes here.

---

<!-- Add dated notes at the top -->

### 2026-07-24 — JZ4Y5 late joiner hides first rematcher

- Blink on peer list when late joiner comes online was `setPlayerOnlinePresence` → `reconcileLobbyPickerState` clearing word. Stale `hasLeft` also blocked durable latch/picker/word visibility. Fix: durable opt-in survives hasLeft; no picker reconcile on presence; pick-word `background-only`.

### 2026-07-24 — False lobby offline from multi-sim inactive

- Waiting lobby presence: `background-only` (not inactive). Play keeps inactive→offline for lock-screen votes. Heal while waiting for rematch baseWord.

### 2026-07-24 — Rematch visibility: late joiner steals pick

- Root was not rotation math: late joiner’s client hid offline first rematcher (no latch/word yet on pick-word). `baseWordPickerUid` now counts as opt-in for visibility/eligibility.

### 2026-07-24 — Rematch lobby asymmetric roster (YZS46)

- First rematcher sees 2; picker sees 1. Local `rematchOptInLatched` ≠ RTDB latch. Latch refresh must run even when AppState inactive; do not mark online while inactive.

### 2026-07-24 — Play UI frozen after screen lock (taps still submit)

- Screenshot: peer standings 6 words vs local 5; timer ~1 min ahead; floating ghost «К»; empty draft. Heal on AppState `active`: clock, clear flies, remount keyboard, refetch own words.

### 2026-07-24 — Standings sheet room progress

- Standings sheet room progress = `Object.keys(displaySession.wordPlayers).length` (same as results `totalDistinctWords`); details must read `displaySession`, not live rematch session. ✕ close (no «Закрити»); tap room code copies via `expo-clipboard` (needs native rebuild after pod install).
- `pod install` failing with Expo* Local Podspecs / Podfile.lock snapshot mismatch after adding a native Expo module: regenerate lock — `cd ios && rm -f Podfile.lock && pod install` (then `npm run ios`).

### 2026-07-24 — Time-up results error trapped user (no Home)

- timeout skipped local archive; modal had no escape. Seed coerce + Home on error.

### 2026-07-24 — Screen lock at rematch start drops liveRoundPlayerUids

- `waitingLobbyOptInUids` was online-only; latch/chosenBy + always include starter.

### 2026-07-24 — «Грати ще» stuck on results while peer lobby shows joiner

- Waiting rematch: navigate after latch+read; presence backgrounded. Playing still awaits presence.

### 2026-07-24 — Second rematcher steals pick (DSSN2)

- Round-3 rightful chooser’s word cleared when peer opted in (multi-sim offline). Sticky chosenBy + clear only when another player is rightful; rematch latch write self-only.

### 2026-07-23 — Empty results list + player_words permission_denied

- Rematch/waiting denies peer `player_words` reads; results showed «0 слів» with standings. Archive-first for pinned viewing round; clear words after `waiting`; spinner until words ready.

### 2026-07-24 — Seat hold removed (WXAGN)

- Product: first rematcher picks/starts; room-join-order rotation among opted-in; rightful later joiner takes seat before start. Seat hold contradicted §4 — removed.

### 2026-07-23 — Round-2 pick stuck on organizer (QBQ4W)

- chosenBy lock blocked rotation when second rematcher joined. Removed lock; latch eligibility remains for inactive steal case.

### 2026-07-23 — Rematch lobby hides first rematcher (XM8EW)

- Second «Грати ще» + multi-sim focus: peer `online:false` without latch → hidden. Concurrent rematch `resultsExitedBy: {actor}` object replace wiped first rematcher's latch; picker rotation cleared their word. Fix: leaf latch writes + presence re-latch + lock picker to chosenBy while word stands.

### 2026-07-23 — Join fails on L8NN5 while host lobby looks open

- RTDB truth: orphan shell (no `status`/`organizerId`) with leftover word/players. Join → `ROOM_NOT_JOINABLE` mislabeled as «приєднання закрито»; host zombie UI from heal that did not clear on null. Fix: orphan → `ROOM_NOT_FOUND`; lobby heal clears local session.

### 2026-07-23 — Rematch second joiner steals pick-word (L8NN5)

- ChosenBy-only was not enough (screenshot: org БЕРЕЗЕЦЬ/2 players vs peer ЛЕПІДОСИРЕН/1; RTDB had org word). Durable `resultsExitedBy` latch through rematch waiting + lobby AppState/focus RTDB heal. Full Metro reload before retesting two sims.

### 2026-07-23 — Stale timer local finish vs remote add-time/pause

- Frozen client (missed listener) keeps old `timerEndsAt`; peer extends/pauses solo. Expire finish fails on RTDB then forced local results. Heal: resync before `forceLocalRoundOver`. Hang not tied to organizer role.

### 2026-07-23 — Pause vote peer miss + stuck cancel

- Same class as resume: RN Modal for session votes + cancel with `applyLocally: false` and no local clear → dead cancel. Overlay + optimistic clear + RTDB re-read. Full Metro reload required if presence HMR still throws `beginPresenceWrite`.

### 2026-07-23 — Presence repair crash + ghost resume after disconnect

- After background: `repairPresenceIntentIfNeeded` threw `undefined is not a function` (`latestPresenceIntent` / HMR stale binding). Soften via `presenceWriteQueue.latestIntent` + guard. Vote txs: `applyLocally: false` so aborted disconnect cannot leave proposer-only `resumeVote` UI. Full Metro reload if HMR still looks wrong.

### 2026-07-23 — Self offline on pause UI after unlock

- Lock → unlock on pause: peer correctly saw «в грі»; unlocking client still showed self «не в грі». Heal: `markPlayerOnline` then `tryRead` on active; repair superseded offline writes.

### 2026-07-23 — Stuck presence toasts after pause (two simulators)

- Timer 16:32 → 13:33 (~3 min) with toasts still up — dismiss was frozen under AppState `inactive`, not a 3.8s UX wait. Fixed via wall-clock prune + opacity/fade fix + presence coalesce.

### 2026-07-23 — Resume vote invisible on peer pause overlay

- Peer kept «Готове продовжувати» while proposer had live `resumeVote` (two simulators). Pause overlay moved off RN Modal → absolute fill; AppState `active` re-reads session via `tryReadGameSessionSnapshot`.
- Related: inactive→offline presence still applies when switching simulator focus — required set can shrink / auto-resume if peer is offline in RTDB.

### 2026-07-23 — Review follow-ups (results ensure UX + expire dedupe)

- `navigateToResults`: pin local time-up round; hold rematch round-key; ensure fail-fast incl. finished N+1; archive before replace for both `already_finished` and `rematch_advanced` (RTDB write else local seed); catch → modal error; expire draft clear only when not deferring.
- Expire skip: `shouldSkipExpireFinishForPinnedTimeUp` uses `roundOverPendingResults` + pin (covers natural RTDB finish, not only `localRoundOverForced`).
- Add-time clearing time-up: bumps `resultsNavEpochRef`, clears busy/error/inFlight so stale `errorOpenResultsFailed` cannot reappear on next time-up.
- `useLiveRosterPlayerWords`: early-return (`!enabled` / empty roster) sets bootstrap complete via `shouldCompleteWordsBootstrapWithoutFetch`.
- Rematch lobby: lobby→pick-word is **`push` + `fromLobby`** (not `replace` — that fired leave-home via `useSyncedStackBack`); pick-word skips presence when stacked; focus RTDB re-read; picker-only baseWord write; **opt-in latch** so peer becoming picker does not bounce first player to prior results.
- High audit fixes (2026-07-23): archive rematch uses `rematchWaitingPlayerPatch`; lobby auto-join no longer treats organizer as opted-in by default; pause vote 30s silence → activate.
- Presence: AppState `inactive` (iOS lock) also → `markPlayerOffline` — lock often never reaches `background`.
- Residual: ~2s pre-`forceLocalRoundOver` rematch window (known-issues); `router.replace` rarely throws — busy may stick until unmount if nav no-ops.
- Commit hygiene: prefer 3–4 commits (rejoin/routing | timer/results | word reset | docs) — not one mixed commit. Branch may be diverged from `origin/dev`.

### 2026-07-21 — Post-1.3.5 multiplayer stability fixes

- Shipped surgical fixes (not full online rollback): atomic `rejoinExistingPlayer`, post-join `isLiveParticipant` + `fromJoin` archive skip, play local word clear on `baseWordRound` bump, AppState-active presence reconcile, 00:00 submit gate + local round-over after failed `finishGameSessionIfExpired`.
- App Check field metrics: see 2026-07-18 note (ops only until installs on 1.4.2+).

### 2026-07-18 — Store App Check 100% Invalid (web appId + missing EXPO_PUBLIC prod flag)

- Confirmed via Firebase MCP: Android `…:android:6c8ea52a…`, iOS `…:ios:1bf134e3…`, web `…:web:a2fdb146…`. Local/CI used a **web** single `EXPO_PUBLIC_FIREBASE_APP_ID` (removed — platform ids only; see ADR-016).
- Android SHA list already has SHA_1 `f75a2267…` + SHA_256 `dd18df5b…` — still verify Play Console **App signing** cert matches (upload vs Google Play App Signing).
- Fix shipped in code: `EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION` on EAS production + platform app ids from `.env` / GitHub `release` secrets (not hardcoded, no web fallback). Needs a new store build (1.4.2+) to validate Verified metrics.
- Manual Console checks: App Check → each app → Play Integrity / App Attest registered; do not Enforce yet.

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
