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

## ADR-004: Presence handoff between in-room screens

- **Decision:** In-room navigation (lobby ↔ play ↔ results) sets a presence handoff token so unmount does not mark the player offline.
- **Alternatives considered:** Longer onDisconnect delay; never mark offline on unmount.
- **Why rejected:** Without handoff, brief offline flashes confused other players and triggered false toasts. Never marking offline broke voluntary-leave semantics.
- **Date:** 2026-07 — `lib/online/presence-handoff.ts`

## ADR-005: Passive roster members route to results during `playing`

- **Decision:** `resolvePostJoinRoute()` sends players to play only when `isActiveLivePlayer()` (in `liveRoundPlayerUids`, online, not voluntarily left).
- **Alternatives considered:** All roster members join play on any `playing` status.
- **Why rejected:** Mid-round invitees and non-opt-in roster ghosts are in the room history but not active participants; they should see results/spectator flow, not an empty play screen.
- **Date:** 2026-06 — `lib/online/post-join-route.ts`

## ADR-006: Auto x2 latches on at 3+ live-round players, never off mid-round

- **Decision:** In `auto` mode, `uniqueBonusEnabled` turns on when the **current round's live roster** reaches 3+ (`liveRoundPlayerUids` during `playing`/`finished` rematch rounds; full session roster in round 1) and scores recompute. Once on for a round (`settings.uniqueBonusEnabled === true` in RTDB or latched via join), it **never turns off** during that round even if live roster drops below 3. `off` mode never enables x2 or score recompute for bonus during the round. Each new round resolves fresh from the live roster at round start.
- **Alternatives considered:** Freeze bonus strictly at round-start roster (never enable mid-round); recompute both on and off when roster crosses threshold.
- **Why rejected:** Product spec requires x2 when 3+ join at any stage; disabling mid-round after someone leaves would unfairly strip points already earned under x2 rules.
- **Date:** 2026-06 (updated 2026-07) — `lib/firebase/session-settings.ts`, `uniqueBonusEnabledForActiveRound()`

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

- **Decision:** Drop `session_word_maps/.../wordFirst`. When a second player finds a unique-bonus word, demote peer scores using `wordPlayers` peers and session score deltas (`−1` for former sole finder; submitter `+entry.points`).
- **Alternatives considered:** Keep write-once `wordFirst`; recompute absolute totals from full maps on every submit.
- **Why rejected:** `wordFirst` looked like exclusive word claiming (removed product) and required an extra write-once path. Full-map recompute is heavier; partial maps already made absolute totals incorrect for multi-word scores.
- **Date:** 2026-07 — `lib/online/apply-word-submit-to-session.ts`, `lib/firebase/player-words-service.ts`

## ADR-013: Parallel wordSet + increment for single-score submits

- **Decision:** After `wordPlayers` shard commit, write `player_words` in parallel with the score path. Use `ServerValue.increment` only for `plan.mode === 'single'`. Keep absolute multi-player transaction for x2 peer demotion. On partial failure, roll back shard + `player_words` and best-effort undo score.
- **Alternatives considered:** Increment also for demotion; parent-word transaction to serialize same-word finds; sequential wordSet after score (previous).
- **Why rejected:** Demotion + increment over-penalizes when two “second finders” race. Parent-word serialization is a larger redesign. Sequential wordSet left ~30–45ms on the listener path.
- **Date:** 2026-07 — `lib/firebase/player-words-service.ts`, `lib/online/word-maps-shard-rollback.ts`

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

---

When adding a new ADR: keep it short; link the implementing file; do not duplicate `online-multiplayer-rules.md` tables.
