# Agent session notes (rolling)

Short-lived observations from AI agent sessions — flaky tests, emulator quirks, temporary workarounds. **Not** the source of truth.

Promote important items to permanent docs (`known-issues.md`, `online-multiplayer-rules.md`, `decisions.md`) and delete stale notes here.

---

<!-- Add dated notes at the top -->

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
