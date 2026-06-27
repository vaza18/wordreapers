# Contributing to Wordreapers

Thank you for helping improve **Словозбирачі** (Wordreapers).

## Development setup

```bash
git clone https://github.com/vaza18/wordreapers.git
cd wordreapers
cp .env.example .env
cp .firebaserc.example .firebaserc   # optional, for Firebase CLI
npm install                          # legal:bundle + sounds:generate
npm run dict:all                     # required once after clone
```

Fill Firebase `EXPO_PUBLIC_*` values in `.env` for online play. The same `EXPO_PUBLIC_FIREBASE_PROJECT_ID` is used by `npm run firebase:deploy:*`.

Download from Firebase Console → **Project settings → General** (gitignored, project root):

- `google-services.json` (Android app `com.wordreapers.app`)
- `GoogleService-Info.plist` (iOS app `com.wordreapers.app`)

Register **App Check** providers (Console → App Check → Apps): Android **Play Integrity**, iOS **App Attest**. Add the same debug UUID under **Manage debug tokens** on both platforms; put it in `EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN` for dev builds.

After changing native Firebase plugins or config files, rebuild the dev client (`npm run android` / `npm run ios`) — a Metro reload is not enough.

Install the **development client** once (`npm run android` or `npm run ios`), then use `npm start` for daily JS work — not Expo Go.

## Quality checks

Run these before opening a pull request:

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run test:coverage   # optional coverage report
npm run dict:validate  # dictionary regression cases
```

Auto-fix formatting: `npm run format`.

## Documentation

When changing user-visible behavior:

- Legal / about → edit markdown under `docs/legal/` or `docs/wordreapers_about.md`, then `npm run legal:bundle`

## Pull requests

- Keep changes focused; prefer small, reviewable PRs.
- Add or update unit tests for logic in `lib/`.
- Do not commit secrets (`.env`), `.firebaserc`, `assets/generated/` (sounds, icons, dictionaries), or native `ios/` / `android/` folders.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
