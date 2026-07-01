# Wordreapers (Словозбирачі)

A Ukrainian word game for families: build words from the letters of a base word; the dictionary validates them automatically.

Docs: [`docs/`](docs/) · Repository: [github.com/vaza18/wordreapers](https://github.com/vaza18/wordreapers) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## Project setup

**Requirements:** Node.js 20+ (22 recommended).

```bash
git clone https://github.com/vaza18/wordreapers.git
cd wordreapers
cp .env.example .env          # fill EXPO_PUBLIC_FIREBASE_* for online play
cp .firebaserc.example .firebaserc   # optional: Firebase CLI default project
npm install                   # also runs legal:bundle + sounds:generate
npm run dict:all              # required once after clone (~8 MB)
```

`npm install` generates legal bundles and feedback sounds (`assets/generated/sounds/*.wav`). Dictionaries are built separately with `dict:all` (see below). See [`assets/README.md`](assets/README.md) for the layout.

### Dictionaries (required after clone)

The `assets/generated/dictionaries/uk-uk/` folder holds generated `.txt` / `.json` (~8 MB). Generate locally:

```bash
npm run dict:all
```

After that, restart Metro: `npm start -- --clear`.

#### File layout

```
assets/generated/dictionaries/
  uk-uk/
    dictionary.txt.gz         # gzip word list (~125k normalized words)
    base_words.txt.gz         # autocomplete / shuffle (8+ letters)
    meta.json                 # VESUM version, dictBuildId, counts, build timestamp
    normalization.json        # no apostrophe → canonical form (~1,700 entries)
    supplement_proper_nouns.txt.gz
    supplement_slang.txt.gz
```

At runtime the app extracts plain `.txt` files once per app version into the device cache; the bundle ships gzip only (~1.2 MB vs ~5.7 MB uncompressed).

Future locales get their own subdirectories, e.g. `assets/generated/dictionaries/en-us/`.

Manual exclusions: `scripts/dictionary/blocklist-uk-uk.txt` (committed, one word per line).

Paths are defined in [`lib/dictionary/paths.ts`](lib/dictionary/paths.ts).

`npm run dict:all`:

1. Downloads `dict_corp_vis.txt` into `.data/vesum/` (`dict:fetch`)
2. Filters nouns and writes artifacts (`dict:build`)

If the raw dump is already present:

```bash
npm run dict:build
```

Verification:

```bash
npm run lint            # ESLint + JSDoc (lib/)
npm run format:check    # Prettier
npm run typecheck       # TypeScript (app + lib/tests)
npm run dict:validate   # dictionary regression cases (scripts/dictionary/run-validation-tests.ts)
npm test                # unit tests
```

Transitive dependency conflicts (e.g. `uuid` in Expo’s iOS tooling, `react-native-worklets` peer ranges) are pinned via [`package.json`](package.json) `overrides` when upstream has not caught up yet. Re-run `npm run audit` after dependency upgrades.

Pipeline details: [`scripts/dictionary/README.md`](scripts/dictionary/README.md).

### Mobile app (Expo development build)

This project uses **[expo-dev-client](https://docs.expo.dev/develop/development-builds/introduction/)** — a custom dev app on your phone/emulator, not Expo Go.

**First time** (installs native dev client; Android needs [Android Studio + SDK](docs/android-dev-setup.md)):

```bash
npm run dict:all          # build dictionaries (required once after clone)
npm run android           # or: npm run ios
```

**Daily development** (after the dev client is installed):

```bash
npm start                 # Metro for development build (expo start --dev-client)
```

Open **Словозбирачі** on the device (not Expo Go). Reload from the dev menu or shake the device.

Cross-network / USB-only: `npm run start:tunnel`.

After `app.json` or native plugin changes: `npm run android` or `npm run ios` again (rebuilds native project).

Cloud dev APK (optional, no local Android SDK): `npm run build:android:dev`.

### Firebase deploy (maintainers)

Database rules and Cloud Functions deploy read `EXPO_PUBLIC_FIREBASE_PROJECT_ID` from `.env`:

```bash
npm run firebase:deploy:rules
npm run firebase:deploy:functions
npm run firebase:deploy:backend
```

The app bundles dictionary files from `assets/generated/dictionaries/uk-uk/` (same output as `npm run dict:build`).

### Store builds (maintainers)

Production Android/iOS builds use [EAS Build](https://docs.expo.dev/build/introduction/):

```bash
eas build --platform android --profile production   # AAB → Google Play (cloud)
eas build --platform ios --profile production       # IPA → TestFlight (cloud)
```

**Local EAS builds** (`--local` excludes gitignored `.env` from the archive — scripts export env first):

```bash
npm run build:android   # AAB on Mac (Android SDK)
npm run build:ios       # IPA on Mac (Xcode)
```

Firebase keys for release builds: EAS **production** environment (`EXPO_PUBLIC_FIREBASE_*`). Local step-by-step notes: `docs/store/` (gitignored on maintainer machines).

**Testers:** Google Play internal/closed testing (opt-in link from Play Console); iOS via TestFlight after IPA upload.

**Development builds** use `expo-dev-client` (`npm run android` / `npm run ios`, then `npm start`). **Do not use Expo Go** — native modules (camera, notifications, fullscreen status bar) need the dev client or a store build.

**Fullscreen / hidden status bar:** works in dev builds and production (`app.json` + `StatusBar hidden`). Settings in [`app.json`](app.json) (`androidStatusBar.hidden`, iOS `UIStatusBarHidden`).

**First `expo run:android` on Mac:** requires [Android Studio](https://developer.android.com/studio) + SDK + `ANDROID_HOME`. Step-by-step: [`docs/android-dev-setup.md`](docs/android-dev-setup.md). Quick check: `npm run android:check`.

**If the dev client shows “Failed to download remote update”:** the phone could not reach Metro on your computer. Try:

1. Phone and computer on the **same Wi‑Fi** (no guest network / VPN), or USB with `adb reverse tcp:8081 tcp:8081`.
2. Reload from the dev menu or restart the app.
3. Tunnel (works across networks): `npm run start:tunnel`.
4. Restart Metro with a clean cache: `npx expo start --dev-client --clear`.
5. Allow incoming connections on port **8081** in the Mac firewall (System Settings → Network → Firewall).

**Stack:** Expo SDK 54, Expo Router 6, React 19.1, React Native 0.81, Zustand, i18next (uk), shared logic in `lib/dictionary/`.

### Linting & formatting

[ESLint](https://eslint.org/) with [typescript-eslint](https://typescript-eslint.io/) and [eslint-plugin-jsdoc](https://github.com/gajus/eslint-plugin-jsdoc). Config: [`eslint.config.js`](eslint.config.js). Exported APIs in `lib/` require JSDoc comments; types stay in TypeScript (not duplicated in `@param` tags).

```bash
npm run format:check    # Prettier
```
