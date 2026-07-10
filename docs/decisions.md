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

---

When adding a new ADR: keep it short; link the implementing file; do not duplicate `online-multiplayer-rules.md` tables.
