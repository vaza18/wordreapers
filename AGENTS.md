# AGENTS.md — Wordreapers (Словозбирачі)

Ukrainian word game for families: build words from the letters of a base word; the dictionary validates them automatically. **Stack:** Expo SDK 57, Expo Router 57, React Native 0.86, Zustand, Firebase Realtime Database, i18next (uk).

Almost all code is written and maintained by AI agents. This file is the single entry point for how to work in this repo safely.

## Where to find the truth

| Topic                                                               | Source of truth                                                                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Online room state machine (rematch, presence, opt-in, frozen round) | [`docs/online-multiplayer-rules.md`](docs/online-multiplayer-rules.md)                                               |
| Firebase RTDB schema and read/write policies                        | [`docs/firebase_schema.md`](docs/firebase_schema.md)                                                                 |
| Word validation and normalization                                   | [`docs/validation_test_cases.md`](docs/validation_test_cases.md), [`lib/dictionary/`](lib/dictionary/)               |
| Feature status and milestones                                       | [`docs/wordreapers_plan.md`](docs/wordreapers_plan.md)                                                               |
| Screen flows and UX mockups                                         | [`docs/wordreapers_screens.html`](docs/wordreapers_screens.html)                                                     |
| Past bugs and regression lessons                                    | [`docs/known-issues.md`](docs/known-issues.md)                                                                       |
| Why non-obvious design choices exist                                | [`docs/decisions.md`](docs/decisions.md)                                                                             |
| Rolling agent session notes                                         | [`docs/agent-notes.md`](docs/agent-notes.md)                                                                         |
| Legal / about copy                                                  | [`docs/legal/`](docs/legal/), [`docs/wordreapers_about.md`](docs/wordreapers_about.md)                               |
| Release CI (GitHub Release → Firebase backend gate)                 | [`docs/release-ci.md`](docs/release-ci.md)                                                                           |
| Firebase backend CI (rules + functions deploy)                      | [`docs/firebase-deploy-ci.md`](docs/firebase-deploy-ci.md)                                                           |
| Dev Metro action logs (`EXPO_PUBLIC_LOG_LEVEL`)                     | [`lib/debug/dev-log.ts`](lib/debug/dev-log.ts), [`.env.example`](.env.example), [`CONTRIBUTING.md`](CONTRIBUTING.md) |

Types for Firebase live in [`lib/firebase/types.ts`](lib/firebase/types.ts). Shared game logic is in [`lib/game/`](lib/game/). Online session logic is in [`lib/online/`](lib/online/) (~100 files — highest regression risk).

## Workflow when changing behavior

1.  **Read** the relevant doc from the table above before editing code.
2.  **Test first** when fixing a bug or changing edge-case logic: add or extend a test in [`tests/`](tests/) that fails with the old behavior.
3.  **Change** the minimal code needed; prefer pure functions in `lib/` over logic in components.
4.  **Update docs** when user-visible behavior, data flows, or screens change. Keep `docs/wordreapers_screens.html`, `docs/firebase_schema.md`, and `docs/known-issues.md` in sync.
5.  **Record regressions** in [`docs/known-issues.md`](docs/known-issues.md) ONLY when you fix a high-level **architectural invariant break** (e.g. cross-module race family, ADR violation). For local logic fixes (UI jank, platform-specific bugs, simple edge cases), use **in-code comments** (Symptom → Cause → Fix).
6.  **Verify** before claiming done: `npm run ci:check`.

### Risky-zone Pre-flight

When changing behavior in `lib/online/**`, `firebase/**`, or `functions/src/**`, state this block in your reply **before** the first code edit:

```markdown
1. **Expected behavior** — user-visible outcome.
2. **Invariants (must NOT change)** — copy from `docs/online-multiplayer-rules.md` or `docs/decisions.md`.
3. **Affected areas** — files/modules you will touch.
4. **Regression context** — search `docs/known-issues.md` for similar past bugs.
```

## Engineering Standards

### No Legacy Code

Do **not** leave behind compatibility layers, dual code paths, or “just in case” fallbacks. When replacing behavior, delete the old path in the same change. Fail loudly if required input is missing — do not silently fall back to an obsolete value.

### No Dead Code

Do not leave dead stubs, unused symbols, or duplicate gates in the paths you touch.

- **Delete** thin rename wrappers.
- **Drop** pass-through re-exports after a move.
- **Remove** unused exports or orphan helpers.
- **Wipe** commented-out old implementation blocks.

### Commit Hygiene

One logical change per commit. Future agents rely on `git log` and `git blame` to understand **why** code exists. Split Feature, Refactor, Docs, and Tooling changes. Use imperative mood in subjects.

## CI & Quality Gates

Before committing or handing off, you MUST run:

```bash
npm run ci:check
```

This runs:

1.  `npm run lint` — ESLint on the whole repo.
2.  `npm run format:check` — Prettier (must already match).
3.  `npm run typecheck` — TypeScript checks.
4.  `npm run test:coverage` — Vitest unit tests with coverage gate.

**Format before CI:** Run `npx prettier --write <touched-paths>` and `npx eslint --fix <touched-paths>` ONCE on all files changed this session immediately before `npm run ci:check`.

## Domain SOPs

### [Online Multiplayer](file:///Users/Vasyl_Zaitsev/projects/wordreapers/lib/online/)

Highest risk. Room lifecycle involves opt-in rematch, presence, and frozen rounds.

- **Rematch:** Next round starts ONLY for players who pressed «Грати ще».
- **Frozen View:** Players who don't opt in stay on their finished round UI even if RTDB moved to the next.
- **Presence:** `online` / `hasLeft` / `liveRoundPlayerUids` drive lobby visibility.
- **Tests:** Extend `tests/online-invariants.test.ts` for invariant changes.

### [Firebase Backend](file:///Users/Vasyl_Zaitsev/projects/wordreapers/firebase/)

RTDB rules and Cloud Functions.

- **Rules:** Run `npm run test:rules` (requires emulator).
- **Functions:** Add unit tests in `tests/` for logic (e.g., `tests/guard-public-lobby-write-trigger.test.ts`).
- **Deploy:** `npm run firebase:deploy:functions` or `npm run firebase:deploy:rules`.

### [Dictionary & Validation](file:///Users/Vasyl_Zaitsev/projects/wordreapers/lib/dictionary/)

Core gameplay trust.

- **Validation:** Cross-check `docs/validation_test_cases.md`.
- **Verification:** Run `npm run dict:validate`.
- **Build:** Use `npm run dict:build` / `dict:all` (don't edit generated assets).

## Expert Orchestration Workflows

Complex tasks (like staged code reviews or fixing build loops) MUST be delegated to specialized sub-agents using the `task` tool.

### Delegation Pattern

1.  **Identify Trigger:** When a user asks for a review («перевір код», «code review staged») or a build fix loop.
2.  **Load Definition:** Read the relevant agent/skill file from `.cursor/agents/` or `.cursor/skills/`.
3.  **Dispatch Task:** Call the `task` tool. The prompt should be the **content of the agent file** plus the current context (**staged summary/stat only**, intent bullets, prior findings). **CRITICAL:** Do not include the full code diff in the prompt; the sub-agent will read it independently to save tokens.

### Workflow Triggers

| Trigger                                             | Target Agent / Skill File                                                                                            |
| :-------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| «Перевір код», «code review staged», «рев’ю staged» | [`.cursor/skills/wordreapers-staged-review/SKILL.md`](.cursor/skills/wordreapers-staged-review/SKILL.md)             |
| «Повторний аналіз», «перевір виправлення»           | [`.cursor/agents/wordreapers-staged-reviewer.md`](.cursor/agents/wordreapers-staged-reviewer.md) (Mode: `re-review`) |
| «Fix until green», «виправ до апруву»               | [`.cursor/skills/wordreapers-review-fix-loop/SKILL.md`](.cursor/skills/wordreapers-review-fix-loop/SKILL.md)         |

---

## Project Layout

- `app/`: Expo Router screens.
- `components/`: UI components.
- `hooks/`: React hooks (thin wrappers over lib/).
- `lib/`: Pure logic (dictionary, game, online, firebase).
- `store/`: Zustand stores.
- `tests/`: Vitest unit tests.
- `functions/`: Firebase Cloud Functions.
- `firebase/`: RTDB security rules.
- `docs/`: Specs, schemas, mockups, known issues.
