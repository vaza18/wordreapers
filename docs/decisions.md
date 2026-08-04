# Architecture decisions (ADR-lite)

Short record of **why** non-obvious multiplayer rules exist. Complements [`online-multiplayer-rules.md`](online-multiplayer-rules.md) (what) and [`known-issues.md`](known-issues.md) (past bugs).

Format: **Decision → Alternatives → Why rejected → Date**

---

## ADR-001: Opt-in rematch (not automatic next round)

- **Decision:** Next round in the same room starts only for players who pressed «Грати ще» or joined `waiting` after rematch. Non-opt-in players stay on frozen UI for their round.
- **Alternatives considered:** Auto-start next round for entire roster; kick non-opt-in players from roster.
- **Why rejected:** Family play needs low pressure — players who finished viewing results should not be dragged into a new round or lose their results screen. Roster history must remain for room stats.
- **Date:** 2026-06 (codified in `online-multiplayer-rules.md`)

## ADR-002: Fresh RTDB read after «Грати ще»

- **Decision:** `optIntoLiveRound()` always performs a fresh read after `markResultsExited` and may call `restartRematchOnlineRound` before routing.
- **Alternatives considered:** Route from cached local session; optimistic navigation to lobby.
- **Why rejected:** RTDB may already be `waiting`/`playing` from a peer's rematch while the viewer still sees `finished`. Stale cache caused wrong screen (play vs lobby vs pick-word) and duplicate rematch writes.
- **Date:** 2026-06 — `lib/online/opt-into-live-round.ts`

## ADR-003: Frozen round view when live round advances

- **Decision:** When `frozenBaseWordRound < liveBaseWordRound`, UI keeps local frozen snapshot (`shouldKeepFrozenResultsOverLiveFinished`) instead of switching to live RTDB session.
- **Alternatives considered:** Always follow live RTDB; force redirect to lobby when status becomes `waiting`.
- **Why rejected:** Non-opt-in players reviewing round N must not jump to round N+1 results/play when another player starts rematch. RTDB cleanup on rematch must not empty their UI.
- **Date:** 2026-06 — `lib/online/frozen-round-view.ts`

## ADR-004: Presence cleanup does not write offline

- **Decision:** `usePlayerOnlinePresence` cleanup only unsubscribes and consumes the handoff token — it never writes `online` / `hasLeft`. Real offline comes from AppState, intentional leave (`leaveGameSession`), or `onDisconnect`. In-room navigation still sets a handoff token so the next screen owns presence without stale tokens.
- **Alternatives considered:** Mark offline (or leave) on every unmount without handoff; offline-only on waiting unmount.
- **Why rejected:** React remount / `enabled` flicker is not real offline — writing `online: false` flashed peers in lobby (CM2L7) and earlier full-leave paths stuck guests with `hasLeft`. Voluntary leave is explicit, not inferred from unmount.
- **Date:** 2026-07 (updated) — `lib/online/presence/use-player-online-presence.ts`, `lib/online/presence/presence-handoff.ts`

## ADR-005: Passive roster members route to results during `playing`

- **Decision:** `resolvePostJoinRoute()` sends players to play only when `isActiveLivePlayer()` (in `liveRoundPlayerUids`, online, not voluntarily left).
- **Alternatives considered:** All roster members join play on any `playing` status.
- **Why rejected:** Mid-round invitees and non-opt-in roster ghosts are in the room history but not active participants; they should see results/spectator flow, not an empty play screen.
- **Date:** 2026-06 — `lib/online/post-join-route.ts`

## ADR-006: Auto x2 latches on at 3+ live-round players, never off mid-round

- **Decision:** In `auto` mode, `uniqueBonusEnabled` turns on when the **current round's live roster** reaches 3+ (`liveRoundPlayerUids` during `playing`/`finished` rematch rounds; **lobby-visible** roster while `waiting` — same filter as the lobby player list / `isLobbyVisiblePlayer`, so voluntary `hasLeft` does not keep x2 on) and scores recompute. Once on for a round (`settings.uniqueBonusEnabled === true` in RTDB or latched via join), it **never turns off** during that round even if live roster drops below 3. While `waiting`, auto x2 **does** turn off again when lobby-visible count drops below 3. `off` mode never enables x2 or score recompute for bonus during the round. Each new round resolves fresh from the waiting/live roster at round start. Lobby settings banner omits the «бонус x2…» segment when mode is `auto` and visible count is below 3.
- **Alternatives considered:** Freeze bonus strictly at round-start roster (never enable mid-round); recompute both on and off when roster crosses threshold; delete `players/{uid}` on lobby leave so counts shrink naturally.
- **Why rejected:** Product spec requires x2 when 3+ join at any stage; disabling mid-round after someone leaves would unfairly strip points already earned under x2 rules. Deleting roster nodes on leave breaks rematch sticky base word, soft-rejoin, and mid-round standings — soft `hasLeft` stays; waiting x2 must follow lobby visibility instead.
- **Date:** 2026-06 (updated 2026-07, 2026-07 lobby visibility) — `lib/firebase/session-settings.ts`, `uniqueBonusEnabledForActiveRound()`

## ADR-007: Expo SDK 55 + AGP 8.12 optimized resource shrinking

- **Decision:** Upgrade Expo 54 → 55 (RN 0.83, AGP 8.12) on branch `upgrade/expo-sdk-55`. Enable `android.r8.optimizedResourceShrinking=true` for production builds only via a custom config plugin; keep existing R8 minify + shrinkResources from `expo-build-properties`. Raise production `org.gradle.jvmargs` to `-Xmx4g -XX:MaxMetaspaceSize=1g` (Expo default 2g/512m OOMs Metaspace during local R8).
- **Alternatives considered:** Stay on SDK 54; jump to SDK 56 / AGP 9 for default class repackaging; enable `-repackageclasses` immediately; leave Gradle JVM defaults and rely on EAS cloud only.
- **Why rejected:** SDK 55 is the recommended path for AGP 8.12 without broader template churn. AGP 9 / SDK 56 is a larger jump. Class repackaging is deferred until a stable production AAB is verified (Play Console indicator is secondary to build stability). `NODE_ENV=production` in `eas.json` was removed — it caused `npm ci` to omit devDependencies and fail `postinstall` (`tsx` for `legal:bundle`). Local `eas build --local` failed at `:app:minifyReleaseWithR8` with `OutOfMemoryError: Metaspace` under 512 MiB.
- **Date:** 2026-07 — `app.config.js`, `plugins/with-android-r8-optimizations.cjs`

## ADR-008: Expo SDK 56 + RN 0.85 toolchain

- **Decision:** Upgrade Expo 55 → 56 (RN 0.85, React 19.2.3, Hermes v1 default, AGP 9.x) on branch `upgrade/expo-sdk-56`. Bump iOS deployment target to 16.4; add `forceStaticLinking: ['RNFBApp', 'RNFBAppCheck']` for RNFirebase with RN prebuilt core. Migrate app `@react-navigation/*` imports to `expo-router` / `expo-router/react-navigation` (SDK 56 forks React Navigation). Move splash config from legacy `app.json` `splash` to `expo-splash-screen` plugin. Keep ADR-007 R8 optimized shrinking + Gradle JVM 4g/1g; keep Metro `@firebase/auth` hoist and `REACT_NATIVE_PACKAGER_HOSTNAME=localhost`; do not put `NODE_ENV=production` in `eas.json`.
- **Alternatives considered:** Stay on SDK 55; opt out of Hermes v1; disable prebuilt RNCore via `buildReactNativeFromSource` / `RCT_USE_PREBUILT_RNCORE=0` immediately; enable `-repackageclasses` for Play size indicators.
- **Why rejected:** Staying on 55 increases future upgrade debt. Hermes v1 is the SDK 56 default and the project does not use `react-native-reanimated` (known memory regression). Prefer Expo-documented `forceStaticLinking` before disabling prebuilt RNCore. Class repackaging remains deferred; AAB size is not a merge gate. TypeScript 6 accepted via `expo install --fix`; deprecated `baseUrl` removed in favor of prefixed `paths` entries.
- **Date:** 2026-07 — `package.json`, `app.config.js`, `app.json`, navigation import sites, `tsconfig.json`

## ADR-009: Expo SDK 57 + RN 0.86 toolchain

- **Decision:** Upgrade Expo 56 → 57 (RN 0.86, React 19.2.3 unchanged) on branch `upgrade/expo-sdk-57`, parented from green `upgrade/expo-sdk-56`. Register `expo-font` and `expo-status-bar` config plugins in `app.json` (SDK 57 install autofix cannot write dynamic `app.config.js`). Keep ADR-007 R8 optimized shrinking + Gradle JVM 4g/1g; keep ADR-008 `forceStaticLinking: ['RNFBApp', 'RNFBAppCheck']`, iOS deploymentTarget 16.4, Firebase CocoaPods pin, Metro `@firebase/auth` hoist, `REACT_NATIVE_PACKAGER_HOSTNAME=localhost`; do not put `NODE_ENV=production` in `eas.json`; do not enable `-repackageclasses`.
- **Alternatives considered:** Stay on SDK 56; wait weeks after SDK 56 production store submit before upgrading; disable prebuilt RNCore; add direct `react-native-reanimated`.
- **Why rejected:** SDK 57 is Expo’s intentional non-breaking RN 0.85→0.86 bump with no app-code migrations expected. Waiting weeks adds little value after the hard 55→56 work. Prefer existing `forceStaticLinking` over building RN from source. Do not add a direct reanimated dependency (Hermes V1 memory regression still documented); transitive native pods from Expo modules are acceptable as long as JS does not import reanimated.
- **Date:** 2026-07 — `package.json`, `app.json`

## ADR-010: Persist paused rounds across process death

- **Decision:** On cold start, auto-restore (1) a local training snapshot into `organizer-solo-store` + solo play with pause modal, or else (2) a paused multiplayer room via local resume pointer only when RTDB still has `playing` + `pauseState.active`. Do not auto-navigate into an unpaused live multiplayer round.
- **Alternatives considered:** Zustand `persist` for all solo state; universal session-resume abstraction; home-screen CTA instead of auto-route; TTL on snapshots.
- **Why rejected:** Full persist writes too often and mixes concerns. Unpaused multiplayer must keep a shared server timer. Auto-route matches “return to dinner pause” UX; snapshots clear on finish/explicit leave (no TTL).
- **Date:** 2026-07 — `lib/game/solo-round-snapshot.ts`, `lib/online/session/paused-online-resume.ts`, `lib/app/resolve-interrupted-round-resume.ts`

## ADR-011: Persist left-round screen across process death

- **Decision:** While the viewer is on `/online/left` after voluntary leave, persist `wordreapers.leftOnlineResume`. Cold-start priority: solo → paused online → left screen. Restore opens left (with «Повернутись до гри» if still playing), not auto-rejoin into play. Keep the pointer when the round finished so left can show results; clear on Home or successful rejoin / missing room.
- **Alternatives considered:** Auto-rejoin into play; home CTA only; reuse paused pointer with a `kind` field.
- **Why rejected:** Intentional leave must not silently re-enter the round. Separate pointer keeps pause vs leave semantics clear.
- **Date:** 2026-07 — `lib/online/session/left-online-resume.ts`, `lib/app/resolve-interrupted-round-resume.ts`

## ADR-012: x2 demotion via wordPlayers peers (no wordFirst)

- **Superseded (2026-08):** Live RTDB score writes and peer demotion transactions removed. x2 / overlap scoring is **client-derived** from `wordPlayers` counts (`buildStandingsFromSessionWordMaps`, `buildLiveStandingsFromSession`). Sole finder on a word gets x2 when unique bonus is on; second+ finder on the same word scores normal (+1). No `x2Claim` / `x2Demoted` RTDB paths.
- **Original decision (2026-07):** Drop `session_word_maps/.../wordFirst`. When a second player finds a unique-bonus word, demote peer scores using `wordPlayers` peers and session score deltas (`−1` for former sole finder; submitter `+entry.points`).
- **Alternatives considered:** Keep write-once `wordFirst`; recompute absolute totals from full maps on every submit.
- **Why rejected:** `wordFirst` looked like exclusive word claiming (removed product) and required an extra write-once path. Full-map recompute is heavier; partial maps already made absolute totals incorrect for multi-word scores.
- **Date:** 2026-07 — `lib/online/apply-word-submit-to-session.ts`, `lib/firebase/submit-online-word.ts`; superseded 2026-08 shard-only submit

## ADR-013: Shard-first submit + increment for single-score submits

- **Superseded (2026-08):** Online submit writes **only** `session_word_maps/{gameId}/wordPlayers` shards (parent create on empty word node; second+ leaf `/{uid}: true`). No session `score` / `wordCount` RTDB updates from **current** clients during play; no `x2Claim` latch or demotion score TX. Standings, badges, and word lists derive on clients from inverted maps + round lexicon. **RTDB `players/*/score` and `wordCount` are obsolete for new clients** — caps remain for outdated store clients during review coexistence (ADR-021); remove in a later release after approval + legacy deprecation (not same-day), not a permanent lock-to-0.
- **Original decision (2026-07–08):** After `wordPlayers` shard commit, run the score path (no separate `player_words` write). First finder **parent-creates** an empty `wordPlayers/{normalized}` node; second+ use **leaf** writes (parent rewrite denied — RTDB rules cannot safely require preserving peer children). Leaf create/delete only while `playing`. Unique bonus used `x2Claim/{normalized}` plus `x2Demoted/{normalized}` after settled demotion; peer demotion used multi-player score transactions with live deltas.
- **Alternatives considered:** Parallel `player_words` leaf with `{display,at}`; increment also for demotion; absolute peers `nextScore` writes; leaf-only shard writes without parent serialization; demote all peers when `shardPrevGlobal === 1` without a claim latch.
- **Why rejected:** Dual `player_words` duplicated maps and doubled submit traffic. Demotion + increment over-penalizes when two “second finders” race. Absolute peers writes lose concurrent other-word increments and break delayed first-finder + demotion races. `shardPrevGlobal === 1` without a latch over-/under-demotes when 3+ leaf finders race (auto x2). Live score TX added latency, rollback complexity, and desync vs derived standings.
- **Date:** 2026-07 — originally `lib/firebase/player-words-service.ts`; 2026-07 client drop of `player_words` → `lib/firebase/submit-online-word.ts`; 2026-08 parent-word shard + live demotion deltas + x2Claim; **superseded 2026-08** client-derived scores / shard-only submit

## ADR-014: Client-only round playable lexicon (no Firebase snapshots)

- **Decision:** Build and cache the round playable lexicon only on device (in-memory + local AsyncStorage archives). Do not upload `PlayableLexiconSnapshot` to RTDB/Storage for joiners. Speed via O(1) dictionary membership (`Set`) and `Intl.Collator` for sorts — not by sharing word lists over Firebase. Setup/pick-word prefetch runs only after select/shuffle/blur (`immediate`), not while typing — the playable-words hint uses `pending` (spacer, no «Обери базове слово») until commit (avoids JS-thread contention with the keyboard on Android). Typing soft-pauses in-flight work without evicting cache; hard clear only for empty/too-short.
- **Alternatives considered:** Host publishes lexicon to Firebase so mid-round joiners skip the scan; Hermes micro-opts (typed letter masks / yield tuning) as primary fix; debounced prefetch while typing; evict cache on every typing keystroke.
- **Why rejected:** Lexicon is static per base word/settings; large payloads pressure free-tier limits; training/solo must stay fast offline. Device evidence showed `localeCompare('uk')` in lookup/sort dominated wall-clock, not scan structure or Firebase absence. Typing-time prefetch contended with cooperative yields on Android. Evicting on typing forced a full rebuild after a typo.
- **Date:** 2026-07 — `lib/dictionary/dictionary-index.ts`, `lib/dictionary/round-playable-lexicon.ts`, `hooks/useSetupPlayableLexiconHint.ts`

## ADR-015: OS-localized home-screen app name

- **Decision:** Production default `name` stays `Wordreapers`. When the device language is Ukrainian, native home-screen label is `Словозбирачі` via Expo `locales.uk` (`CFBundleDisplayName` / `android.app_name`) and `ios.infoPlist.CFBundleAllowMixedLocalizations`. Store listing titles remain English brand + Ukrainian subtitle/description.
- **Alternatives considered:** Always show `Словозбирачі` in production; keep English-only home-screen name; third-party Android-only name plugin.
- **Why rejected:** English brand matches store listing; Ukrainian speakers should still see the local name under a Ukrainian OS. SDK 57 already writes Android `values-b+uk/strings.xml` from `locales` — no extra plugin.
- **Date:** 2026-07 — `app.json`, `locales/app-metadata/uk.json`, `app.config.js`

## ADR-016: Platform Firebase app ids only (no web legacy fallback)

- **Decision:** Client `initializeApp` uses `EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID` or `_IOS` for the **current** platform (from `.env` / GitHub `release` secrets). Missing **that** platform’s id throws. Store CI jobs only inject the id for the platform being built. No web app id fallback; no hardcoding in source/`eas.json`.
- **Alternatives considered:** Single shared web `EXPO_PUBLIC_FIREBASE_APP_ID`; always require both platform ids on every job; hardcode ids in `app-ids.ts` / `eas.json`.
- **Why rejected:** App Check tokens are app-scoped — web id + native attestation → **Invalid**. Requiring both ids on an android-only job is unnecessary. Hardcoded ids duplicate Console config.
- **Date:** 2026-07 — `lib/firebase/app-ids.ts`, `lib/firebase/config.ts`, `scripts/eas-build-env.sh`

## ADR-017: No legacy compatibility code by default

- **Decision:** Agents must not leave dual paths, deprecated aliases, or silent fallbacks when replacing behavior. Update all callers to the new contract and fail loudly if required input is missing. Keep transitional support only when the user explicitly requests it.
- **Alternatives considered:** Soft deprecation windows; “preferred + old still works” env/API shims.
- **Why rejected:** Hidden fallbacks mask misconfiguration, multiply edge cases for agent maintenance, and obscure what is actually required. Explicit request is the only exception.
- **Date:** 2026-07 — `.cursor/rules/no-legacy-code.mdc`, `AGENTS.md`

## ADR-018: Dev-only multiplayer action logs

- **Decision:** Client action logs go through `lib/debug/dev-log.ts`, gated by `__DEV__` (always silent in production) and `EXPO_PUBLIC_LOG_LEVEL` (`none` \| `error` \| `event` \| `detail` \| `all`). Default in dev when unset: `event` (local key actions only). Observed remote peer events require `detail`+. Timings (lexicon, submitWord) require `all`. Format: local wall-clock + player name + action.
- **Alternatives considered:** Always-on console in prod; in-app Settings toggle; remote events at every level.
- **Why rejected:** Prod noise and privacy; ENV is enough for simulators; remote at `event` doubles noise across two Metro consoles.
- **Date:** 2026-07 — `lib/debug/dev-log.ts`

## ADR-019: Scheduled client expiry (no N×1s full-session polls)

- **Decision:** Vote wall-clock expiry and round timer finish stay client-committed (RTDB has no server cron for these). Clients schedule a local wake at `expiresAt` / `timerEndsAt` instead of polling every second. Primary resolver is the lexicographically smallest online live-round uid; other online candidates failover after ~1.5s if the vote/status is still open. Cast-vote transactions and `reconcileOpenSessionVotes` on presence remain event-driven. Multiple screens on one room share one `subscribeGameSession` RTDB `onValue` (ref-counted).
- **Alternatives considered:** Cloud Function scheduled expiry; every client keeps 1 Hz get+transaction; single resolver with no failover; narrowing live listeners / `onChild*` for word-maps (deferred → **shipped as ADR-022**).
- **Why rejected:** Functions add latency/ops cost for a small game. 1 Hz × N full-session reads dominate RTDB downloads with tiny storage. No-failover hangs if primary is backgrounded at the deadline. Listener narrowing was higher regression risk — done separately after Usage stayed high and maps became sole SoT.
- **Date:** 2026-07 — `lib/online/voting/expiry-resolver-role.ts`, `hooks/useVoteExpiryResolver.ts`, `lib/online/play-expire-finish-schedule.ts`, `lib/firebase/game-session-service.ts`

## ADR-020: No mid-round cache→RTDB word restore while session exists

- **Decision:** Local active-round cache may still seed UI / orphan rebuild (`restorePlayingSessionFromLocalCache` when the session root is missing). While a live `playing` session exists, the client does **not** push cached `wordPlayers` / own words back into RTDB when remote maps are empty. Maps listener + AppState `tryFetchSessionWordMaps` are the heal path. Mid-play spurious empty snapshots do **not** wipe rich local maps (rules are append-only while `playing`; score-path rollback is gone). Empty wipe applies only via round-reset gate (`awaitingEmptySync` / force-sync exhaustion).
- **Alternatives considered:** Restore `tryRestoreActiveRoundCache` (write shards when remote empty / own uid missing and timer live); reconcile score↔words from cache; mid-play authoritative empty clear (score-path rollback era).
- **Why rejected:** Re-introduces dual SoT and can resurrect wiped/stale maps after rematch or intentional clear. Traffic goal is a single `wordPlayers` path. Mid-play empty clear caused permanent blank lists after reconnect/`unavailable`. Edge desync is accepted for this drop; revisit only with an explicit product ask.
- **Date:** 2026-07 (updated 2026-08) — `lib/online/session/cache-active-round.ts`, `lib/online/session/play-word-maps-apply.ts`, `lib/online/session/rejoin-online-round.ts`

## ADR-021: Keep legacy `player_words` rules + score caps during store review

- **Decision:** While the new shard-only / derived-standings app is in Google/Apple review, keep RTDB `player_words` rules and `players/*/score`|`wordCount` caps so **outdated store clients** still work. Current clients neither read nor write `player_words` and do not write live score/wordCount. CF scheduled session purge no longer deletes `player_words` (one-shot wipe later via ops).
- **Alternatives considered:** Remove rules/CF/`player_words` and score leaves in the same production release (strict no-legacy).
- **Why rejected:** Cutting the path mid-review breaks testers and residual store installs on the previous binary. Coexistence is an explicit product migration window, not permanent dual SoT for new clients.
- **Removal condition:** After the new app is approved on both stores **and** legacy clients are deprecated (agree N% on new version and/or X weeks after prod) → wipe `player_words/**` → remove rules branch → drop score/wordCount from types/seeds/rules → deploy. Documented in `firebase_schema.md`.
- **Date:** 2026-08 — `firebase/database.rules.json`, `functions/src/purge-expired-sessions.ts`, `docs/firebase_schema.md`

## ADR-022: Narrowed `session_word_maps` listen (listeners-first + get reconcile)

- **Decision:** Live clients attach `onChildAdded` / `onChildChanged` / `onChildRemoved` on `session_word_maps/{gameId}/wordPlayers` **before** the seed `get` completes. Subscribe awaits `ensureAnonymousAuth` first (cold-open PD); hung auth emits `unavailable` after `WORD_MAPS_AUTH_TIMEOUT_MS` without attach. Child ops are buffered (coalesced by word key) until seed finishes, then reconciled as `get` baseline + buffer. Provisional buffer snapshot (16ms, `seed: 'provisional'`) is **ignored by play and results roster display** (spinner until authoritative/fetch or `mapsUnavailable` CTA — no time-escape over provisional); open SoT on first authoritative/non-empty fetch so grow-only cannot stick a buffer peak over a smaller authoritative seed. Never clears play `awaitingEmptySync` from provisional; never completes results bootstrap/freeze/finalize from provisional. Authoritative seed only via successful `get` `finishSeed` (or non-empty one-shot fetch for results — late rich fetch may open-apply over empty authoritative listen during rematch wipe). Soft hung-`get` / retryable hard-fail **single-flight**: `seedGetMaxAttempts` is a **dual budget** (max real `startSeedGet` **and** soft-timeout ticks per hung get). Forever-hung get#1 abandons after N soft ticks with **get call count still 1** — not N sequential gets; extra real gets only after hard-fail settle. Soft-timeout must never start a parallel get (late-seal). Soft-timeout abandons only on soft-tick cap (not because seedAttempt already hit max on the last real get). Lazy supersede when the next get starts. Results keeps maps listen after an **empty** freeze (`shouldEnableResultsMapsRosterListen` + roster kept until **rich** freeze) so late children can upgrade; rich freeze disables. Play remounts until fail-loud max then **stop** until Retry (worst-case hung banner ≈ epochs × N × 8s — **product signed-off** SLA; do not shorten / parallel-get).
- **Alternatives considered:** Keep root `onValue`; **get-then-attach** (loses removes between get resolve and attach — rejected); sync-emit `{}` without get; PD → empty maps; PD+buffer finishSeed (rejected — partial authoritative); unbounded buffer/retry (rejected); child-only without get (join flicker); treat provisional as bootstrap/wipe-complete (rejected — sticky prior-round / partial freeze); soft-timeout burns attempt budget / eager supersede parallel gets (rejected); attach maps without waiting for auth (rejected — cold PD abandon); shared ref-counted maps sub in the same change.
- **Why rejected:** Root `onValue` re-downloads the whole `wordPlayers` tree on each word submit after maps became sole SoT. Get-then-attach races rematch wipe into sticky rich UI (worse under ADR-020 empty-block). Sync empty and PD→empty regress blank play/results. Provisional-as-authoritative locks partial standings or clears wipe-gate early under grow-only. Ref-count deferred.
- **Date:** 2026-08 — `lib/firebase/session-word-maps-service.ts`, `lib/firebase/session-word-maps.ts`, `lib/firebase/paths.ts`

---

When adding a new ADR: keep it short; link the implementing file; do not duplicate `online-multiplayer-rules.md` tables.
