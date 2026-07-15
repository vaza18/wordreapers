# Agent session notes (rolling)

Short-lived observations from AI agent sessions — flaky tests, emulator quirks, temporary workarounds. **Not** the source of truth.

Promote important items to permanent docs (`known-issues.md`, `online-multiplayer-rules.md`, `decisions.md`) and delete stale notes here.

---

<!-- Add dated notes at the top -->

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

### 2026-07-14 — RTDB TTL + wordFirst removal

- Deploy: functions → rules → client; then `DRY_RUN=1 npm run firebase:purge-orphans` then real wipe.
- Scheduled purge full-scans `game_sessions` (not only `purgeAfterAt` index) so missing-`createdAt` waiting/playing die immediately — deploy client `createdAt` writes before/with functions if you need to spare live test rooms.
- Room codes exactly 5: fixtures must use 5-char ids (`REMCH2` truncated to `REMCH` and broke rules tests).

### 2026-07-13 — Round resume after process death

- Solo snapshot key `wordreapers.soloRoundSnapshot`; always restored as paused; persist on pause/word/addTime/background.
- Online paused pointer only when `pauseState.active`; cold start verifies RTDB. Unpaused live multiplayer is never auto-resumed.
- Left-round pointer `wordreapers.leftOnlineResume`; cold start opens `/online/left` (not auto-rejoin). Priority: solo → paused → left.

### 2026-07-10 — Expo SDK 57 upgrade (upgrade/expo-sdk-57)

- Branched from green `upgrade/expo-sdk-56` (SDK 56 `expo-doctor` 21/21)
- `expo-doctor`: **20/20 passed** (SDK 57)
- `expo`: `^57.0.0` (`57.0.4` resolved), `react-native`: `0.86.0`, `react`: `19.2.3`, `babel-preset-expo`: `~57.0.0`
- `@react-native-firebase/app` + `app-check`: `^25.1.0` (unchanged); iOS CocoaPods pin `$FirebaseSDKVersion = '12.15.0'`
- iOS: `deploymentTarget` `16.4`; `forceStaticLinking: ['RNFBApp', 'RNFBAppCheck']` preserved
- `app.json` plugins: added `expo-font` + `expo-status-bar` (SDK 57 `expo install --fix` cannot autofix dynamic `app.config.js`)
- Hermes v1: still default; no direct `react-native-reanimated` (transitive native pods from Expo modules appear in Gradle — do not import in JS)
- Preserved: R8 optimized shrinking + Gradle JVM 4g/1g; Metro `@firebase/auth` hoist; `REACT_NATIVE_PACKAGER_HOSTNAME=localhost`; no `NODE_ENV` in `eas.json`; no class repackaging
- CNG: `expo prebuild` cleans by default on SDK 57; regenerate `ios/` / `android/` after upgrade
- Local EAS Android production AAB OK (SDK 57, versionCode 45): `build-1783691296654.aab` (~81.0 MiB); `mapping.txt` artifact OK (~68.1 MiB → `build-1783691296739.txt`)
- AAB size (informational): SDK 56 ~80.2 MiB → SDK 57 ~81.0 MiB (+0.8 MiB); not a merge gate
- EAS cloud Android development (`f415ec84…`, versionCode 44) stayed **in queue** >10+ min — used local production build as the Android gate instead
- Local iOS: `expo run:ios` **Build Succeeded** (Slovozbirachi / simulator); script may still exit non-zero on simctl/Metro URL open (same class of flake as prior SDKs)
- iOS EAS development: still needs interactive credentials

### 2026-07-10 — iOS RNFBAppCheck PCH error (local)

- `.env.local` has `APP_VARIANT=production` → Expo native project name `Wordreapers` (not Cyrillic-sanitized `Slovozbirachi`)
- `with-ios-firebase-native-init` must use `modRequest.projectName`; hardcoded `Slovozbirachi` left bridging header importing `RNFBAppCheckModule.h`
- Expo dangerous mods: **last plugin in `app.config.js` runs first** — native-init must be listed _before_ `@react-native-firebase/app` / `app-check` so strip runs after RNFB writes
- After plugin fix: `npx expo prebuild --platform ios`, then `npm run ios` (`scripts/run-ios.sh` → `expo run:ios`; same as `npx expo run:ios`)

### 2026-07-10 — Expo SDK 56 upgrade (upgrade/expo-sdk-56)

- Branched from green `upgrade/expo-sdk-55` (SDK 55 `expo-doctor` 19/19)
- `expo-doctor`: **21/21 passed** (SDK 56)
- `expo`: `^56.0.0` (`~56.0.15` resolved), `react-native`: `0.85.3`, `react`: `19.2.3`, `typescript`: `~6.0.3`
- `@react-native-firebase/app` + `app-check`: `^25.1.0`; iOS CocoaPods pin `$FirebaseSDKVersion = '12.15.0'`
- iOS: `deploymentTarget` `16.4`; `forceStaticLinking: ['RNFBApp', 'RNFBAppCheck']` for RN 0.85 prebuilt core
- Splash: legacy `app.json` `splash` → `expo-splash-screen` config plugin (same image/colors)
- Navigation: `@react-navigation/*` → `expo-router/react-navigation` / `expo-router` types (`NativeStackNavigationOptions`)
- Hermes v1: default (no opt-out); class repackaging still deferred
- Preserved from SDK 55: R8 optimized shrinking + Gradle JVM 4g/1g; Metro `@firebase/auth` hoist; `REACT_NATIVE_PACKAGER_HOSTNAME=localhost`; no `NODE_ENV` in `eas.json`
- EAS: removed `corepack: true` from `eas.json` — it enabled Corepack shims for pnpm/yarn, then EAS retried `npm -g install` and logged non-fatal `EEXIST` noise; project uses npm only (`packageManager: npm@11.6.2` + `eas-build-pre-install`)
- TypeScript 6: removed deprecated `baseUrl` (paths already use `./` prefixes); no `ignoreDeprecations` needed
- EAS Android development OK: https://expo.dev/accounts/vaza18/projects/wordreapers/builds/0f4be023-08f2-48c3-86cf-975f89479a75
- EAS Android production AAB OK (SDK 56, versionCode 43): https://expo.dev/artifacts/eas/pfLc32JBtanzHYRtMI0uOe-flz0lBezXmIR7l-kYRUo.aab
- AAB size (informational): SDK 55 ~67.6 MiB → SDK 56 ~80.2 MiB (+12.6 MiB); not a merge gate
- iOS EAS development: still needs interactive credentials (`eas build --platform ios --profile development`)
- RN 0.85 type cleanups: `StyleSheet.absoluteFillObject` → `absoluteFill`; `StatusBar` dropped `translucent`; `notifyPreventRemove` removed from prevent-remove context (setPreventRemove alone is enough)

### 2026-07-10 — Expo SDK 54 baseline (before upgrade/expo-sdk-55)

- `expo-doctor`: **18/18 passed** (SDK 54)
- `expo`: `~54.0.0`, `react-native`: `0.81.5`, `react`: `19.1.0`
- `@react-native-firebase/app` + `app-check`: `^25.1.0`
- Production R8: `enableMinifyInReleaseBuilds` + `enableShrinkResourcesInReleaseBuilds` in `app.config.js`

### 2026-07-10 — Expo SDK 55 upgrade (upgrade/expo-sdk-55)

- `expo-doctor`: **19/19 passed** (SDK 55)
- `expo`: `~55.0.0`, `react-native`: `0.83.6`, `react`: `19.2.0`
- `firebase` JS: `^12.15.0`; `@firebase/rules-unit-testing`: `^5.0.1`
- Production: `android.r8.optimizedResourceShrinking=true` via `plugins/with-android-r8-optimizations.cjs`
- Production Gradle JVM: `-Xmx4g -XX:MaxMetaspaceSize=1g` (same plugin) — local R8 hit `OutOfMemoryError: Metaspace` at Expo default 512m
- After cancelling a local EAS Android build, stop leftover Gradle daemons before retry (`~/.gradle/.../bin/gradle --stop` or kill `GradleDaemon`). Stale daemon holds `~/.gradle/caches/journal-1` → `Timeout waiting to lock journal cache`. The `mapping.txt` upload error is a follow-on when R8 never ran.
- iOS Firebase CocoaPods pin: `$FirebaseSDKVersion = '12.15.0'`
- RN 0.83: `Appearance.setColorScheme('unspecified')` replaces `null` for Auto theme
- Class repackaging (`-repackageclasses`): deferred until stable production AAB
- EAS production: removed `NODE_ENV=production` from `eas.json` — it skipped devDependencies and broke `postinstall` (`tsx` for `legal:bundle`)
- Metro: `metro.config.cjs` resolves hoisted `@firebase/auth` (firebase 12) instead of nested `firebase/node_modules/`
- Metro IPv6 (SDK 55 / Node 22): binds `::1` only; `npm start` sets `REACT_NATIVE_PACKAGER_HOSTNAME=localhost` so dev client URL is not `127.0.0.1`
- EAS Android dev build OK: https://expo.dev/accounts/vaza18/projects/wordreapers/builds/439c8459-6e47-4252-8f01-be95e48ff192
- EAS Android production AAB OK (SDK 55, versionCode 38): https://expo.dev/artifacts/eas/bwQQcj5-g9_asEJZD3ZeTMvfFomexVsary1ftg3s0dw.aab
- Play Console: upload AAB manually (or `eas submit` interactively) → verify optimization indicators; class repackaging still deferred
- iOS EAS dev build: needs interactive credentials (`eas build --platform ios --profile development`)
