# Security Policy

## Supported versions

Security fixes apply to the latest release on the `main` branch.

## Reporting a vulnerability

Please report security issues privately to **vaza18@gmail.com** rather than opening a public GitHub issue.

Include:

- A clear description of the issue
- Steps to reproduce (if applicable)
- Impact assessment (data exposure, account takeover, etc.)

We aim to respond within 30 days.

## Firebase Realtime Database

Before deploying or open-sourcing:

1. Review [`firebase/database.rules.json`](firebase/database.rules.json).
2. Deploy rules: `firebase deploy --only database --project <your-project-id>`.
3. Restrict the Firebase Web API key in Google Cloud Console (Android package + iOS bundle id).
4. Consider enabling Firebase App Check for production traffic.

Never commit `.env`, `google-services.json`, or `GoogleService-Info.plist`.

## Dependency updates

Run `npm audit` after upgrading dependencies. Dev-only advisories (e.g. esbuild via vitest) should still be tracked and resolved when upstream releases fixes.
