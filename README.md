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

`npm install` generates legal bundles and feedback sounds (`assets/sounds/*.wav`). Dictionaries are built separately with `dict:all` (see below).

### Dictionaries (required after clone)

The `assets/dictionaries/uk-uk/` folder holds generated `.txt` / `.json` (~8 MB). Generate locally:

```bash
npm run dict:all
```

After that, restart Metro: `npx expo start --clear`.

#### File layout

```
assets/dictionaries/
  uk-uk/
    dictionary.txt         # normalized words, one per line (~125k)
    base_words.txt         # autocomplete / shuffle: sorted normalized strings (8+); UI display via displayForm()
    meta.json              # VESUM version, counts, build timestamp
    normalization.json     # no apostrophe → canonical form (~1,700 entries)
    supplement_proper_nouns.txt  # optional when allowProperNouns is enabled
    supplement_slang.txt         # optional when slang is enabled
```

Future locales get their own subdirectories, e.g. `dictionaries/en-us/`.

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

### Mobile app (Expo)

```bash
npm run dict:all          # build dictionaries (required once after clone)
npm start                 # Expo dev server → scan QR in Expo Go
```

### Firebase deploy (maintainers)

Database rules and Cloud Functions deploy read `EXPO_PUBLIC_FIREBASE_PROJECT_ID` from `.env`:

```bash
npm run firebase:deploy:rules
npm run firebase:deploy:functions
npm run firebase:deploy:backend
```

The app bundles dictionary files from `assets/dictionaries/uk-uk/` (same output as `npm run dict:build`).

**Expo Go:** install [Expo Go](https://expo.dev/go) from the Play Store / App Store — this project targets **SDK 54** (matches the store build, e.g. client 54.0.x).

**Fullscreen / hidden status bar:** the app hides the status bar in its own builds (`app.json` + `StatusBar hidden`). **Expo Go cannot remove the system clock/battery row** — that bar belongs to the Expo Go host app, not Wordreapers. To see true fullscreen, use a **development build** on your phone:

```bash
npx expo run:android   # USB debugging + Android SDK, or
npx expo run:ios       # macOS + Xcode
```

Or an EAS preview APK. Settings in [`app.json`](app.json) (`androidStatusBar.hidden`, iOS `UIStatusBarHidden`) apply there.

**First `expo run:android` on Mac:** requires [Android Studio](https://developer.android.com/studio) + SDK + `ANDROID_HOME`. Step-by-step: [`docs/android-dev-setup.md`](docs/android-dev-setup.md). Quick check: `npm run android:check`.

**If Expo Go shows “Failed to download remote update”:** the phone could not reach Metro on your computer (not a dictionary bug). Try:

1. Phone and computer on the **same Wi‑Fi** (no guest network / VPN).
2. Reload in Expo Go (circular arrow) or scan the QR code again.
3. Tunnel (works across networks): `npm run start:tunnel` — wait for the URL, then open it in Expo Go.
4. Restart Metro with a clean cache: `npx expo start --clear`
5. Allow incoming connections on port **8081** in the Mac firewall (System Settings → Network → Firewall).

**Stack:** Expo SDK 54, Expo Router 6, React 19.1, React Native 0.81, Zustand, i18next (uk), shared logic in `lib/dictionary/`.

### Linting & formatting

[ESLint](https://eslint.org/) with [typescript-eslint](https://typescript-eslint.io/) and [eslint-plugin-jsdoc](https://github.com/gajus/eslint-plugin-jsdoc). Config: [`eslint.config.js`](eslint.config.js). Exported APIs in `lib/` require JSDoc comments; types stay in TypeScript (not duplicated in `@param` tags).

```bash
npm run format:check    # Prettier
```
