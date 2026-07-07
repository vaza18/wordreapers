# AGENTS.md — Wordreapers (Словозбирачі)

Ukrainian word game for families: build words from the letters of a base word; the dictionary validates them automatically. **Stack:** Expo SDK 54, Expo Router 6, React Native 0.81, Zustand, Firebase Realtime Database, i18next (uk).

Almost all code is written and maintained by AI agents. This file is the single entry point for how to work in this repo safely.

## Where to find the truth

| Topic                                                               | Source of truth                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Online room state machine (rematch, presence, opt-in, frozen round) | [`docs/online-multiplayer-rules.md`](docs/online-multiplayer-rules.md)                                 |
| Firebase RTDB schema and read/write policies                        | [`docs/firebase_schema.md`](docs/firebase_schema.md)                                                   |
| Word validation and normalization                                   | [`docs/validation_test_cases.md`](docs/validation_test_cases.md), [`lib/dictionary/`](lib/dictionary/) |
| Feature status and milestones                                       | [`docs/wordreapers_plan.md`](docs/wordreapers_plan.md)                                                 |
| Screen flows and UX mockups                                         | [`docs/wordreapers_screens.html`](docs/wordreapers_screens.html)                                       |
| Past bugs and regression lessons                                    | [`docs/known-issues.md`](docs/known-issues.md)                                                         |
| Why non-obvious design choices exist                                | [`docs/decisions.md`](docs/decisions.md)                                                               |
| Rolling agent session notes (promote to permanent docs when stable) | [`docs/agent-notes.md`](docs/agent-notes.md)                                                           |
| Legal / about copy                                                  | [`docs/legal/`](docs/legal/), [`docs/wordreapers_about.md`](docs/wordreapers_about.md)                 |

Types for Firebase live in [`lib/firebase/types.ts`](lib/firebase/types.ts). Shared game logic is in [`lib/game/`](lib/game/). Online session logic is in [`lib/online/`](lib/online/) (~100 files — highest regression risk).

## Workflow when changing behavior

1. **Read** the relevant doc from the table above before editing code.
2. **Test first** when fixing a bug or changing edge-case logic: add or extend a test in [`tests/`](tests/) that fails with the old behavior.
3. **Change** the minimal code needed; prefer pure functions in `lib/` over logic in components.
4. **Update docs** when user-visible behavior, data flows, or screens change (see `.cursor/rules/docs-sync.mdc`).
5. **Record regressions** in [`docs/known-issues.md`](docs/known-issues.md) when you fix a non-trivial bug.
6. **Verify** before claiming done:

```bash
npm run ci:check
```

For Firebase rules or Cloud Functions changes, also run:

```bash
npm run test:rules
```

For dictionary logic changes, `ci:check` already runs `npm run dict:validate`.

## Task specs for non-trivial work

For bugs or features in `lib/online/` or `firebase/`, use [`docs/task-template.md`](docs/task-template.md) (or the GitHub issue template) so invariants and manual verification steps are explicit before coding.

## Agent notes hygiene

[`docs/agent-notes.md`](docs/agent-notes.md) holds short-lived session findings. When a note becomes a stable rule or regression lesson, move it to `known-issues.md`, `online-multiplayer-rules.md`, or `decisions.md` and remove the stale note.

## High-risk zones (extra care)

| Area                                                                 | Why risky                                                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`lib/online/`](lib/online/)                                         | Opt-in rematch, presence, frozen round view, mid-round join — many interdependent edge cases |
| [`lib/game/scoring.ts`](lib/game/scoring.ts)                         | x2 / +N bonus rules affect scores and results                                                |
| [`lib/dictionary/validate-word.ts`](lib/dictionary/validate-word.ts) | Core gameplay validation; regressions break trust                                            |
| [`firebase/database.rules.json`](firebase/database.rules.json)       | Security; weak rules or overly strict rules both hurt                                        |
| [`functions/src/`](functions/src/)                                   | Background purges and lobby guards; failures are silent                                      |

Domain-specific Cursor rules auto-attach when you edit files in these areas (see `.cursor/rules/*-domain.mdc`).

## Project layout (quick map)

```
app/           Expo Router screens (online play, settings, profile)
components/    UI components
hooks/         React hooks (often thin wrappers over lib/)
lib/           Pure logic — dictionary, game, online (rematch/, presence/, session/, voting/), firebase helpers
store/         Zustand stores
tests/         Vitest unit tests (regression tests for edge cases)
functions/     Firebase Cloud Functions (TypeScript)
firebase/      RTDB security rules
docs/          Specs, schemas, mockups, known issues
```

## Commit hygiene

One logical change per commit (feature / refactor / docs separately). Future agents use `git log` and `git blame` to understand _why_ code looks the way it does. See `.cursor/rules/commit-hygiene.mdc`.

## Cursor rules (always or auto-attached)

| Rule                               | When                                                |
| ---------------------------------- | --------------------------------------------------- |
| `docs-sync.mdc`                    | Always — keep docs/mockups/legal in sync            |
| `ci-check-before-done.mdc`         | Always — run `npm run ci:check` before done         |
| `commit-hygiene.mdc`               | Always — atomic commits                             |
| `online-multiplayer-domain.mdc`    | Editing `app/online/`, `lib/online/`, related hooks |
| `dictionary-validation-domain.mdc` | Editing `lib/dictionary/`, `scripts/dictionary/`    |
| `firebase-backend-domain.mdc`      | Editing `firebase/`, `functions/src/`               |
