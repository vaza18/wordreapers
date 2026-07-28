---
name: store-whats-new
description: >-
  Generate Ukrainian Google Play / App Store «Що нового» release notes (≤500
  chars) from commits since the latest stable v* tag on branch dev, and classify
  the next semver bump (patch/minor/major). Use when the user asks for store
  update text, Play/App Store release notes, «що нового», what's new for a
  release, or to prepare changelog text before publishing a release.
---

# Store «Що нового» (MVP)

Generate one shared Ukrainian «what's new» blurb for Google Play Console and
Apple App Store Connect. Do **not** push, open PRs, create GitHub Releases, or
upload store metadata.

## When to use

Trigger on phrases like: «згенеруй що нового», «release notes для сторів»,
«підготуй текст оновлення», «what's new для Play/App Store».

## Hard constraints

| Constraint | Value |
| ---------- | ----- |
| Language | Ukrainian |
| Max length | **500 characters** (Play limit; one text for both stores) |
| Source of previous release | Latest **stable** GitHub Release / tag `vX.Y.Z` (not pre-release) |
| Source of changes | **Committed** tip of local `dev` only |
| Out of scope | Uncommitted work; push; PR; `gh release create`; Play/ASC upload |

## Workflow

Run these steps in order. Prefer `gh` + `git`. Fail clearly if a step cannot complete.

### 1. Resolve previous release tag

```bash
git fetch origin --tags --prune
gh release list --limit 20
```

Pick the newest **non-prerelease** release whose tag matches `v*` (e.g. `v1.4.1`).

If local tags disagree with GitHub, treat GitHub as source of truth and refresh local tags.

If no stable `v*` release exists, stop and ask the user for a baseline tag or version.

### 2. Resolve change range

```bash
git rev-parse --verify dev
git merge-base --is-ancestor <tag> dev
git log --oneline <tag>..dev
git diff --stat <tag>..dev
```

- Require local branch `dev` to exist.
- Require `<tag>` to be an ancestor of `dev`. If not, warn and stop (or ask whether to use another range).
- If `<tag>..dev` is empty, report «немає змін після останнього релізу» and do not invent notes.

Ignore uncommitted / unstaged files when drafting notes. You may mention them as a side note if present.

### 3. Classify release type (semver)

From user-visible impact of commits/diff (not from commit-message prefixes alone):

| Type | When |
| ---- | ---- |
| **patch** | Bug fixes, performance, copy, small UX polish, docs/tooling that do not change player-facing behavior |
| **minor** | New features or noticeable behavior changes that stay backward compatible |
| **major** | Breaking changes, forced migrations, or removal of key capabilities |

Choose the **highest** type that any included change warrants. Default to **patch** when unsure and only fixes/polish are present.

Propose next tag from previous `vX.Y.Z`:

- patch → `vX.Y.(Z+1)`
- minor → `vX.(Y+1).0`
- major → `v(X+1).0.0`

### 4. Draft store text

Write for **players / parents**, not engineers:

- Short bullets or short sentences (Ukrainian).
- Lead with the most user-visible wins.
- Skip CI, refactors, dependency bumps, internal renames unless they fix a user-facing bug worth mentioning.
- Prefer concrete wording («Виправили зависання кімнати після «Грати ще»») over vague («Покращення стабільності»).
- Count characters carefully; stay **≤ 500**. If over, cut lowest-priority items first.

#### Plain Ukrainian (no slang)

Store text must read naturally for parents and kids. **Do not** use gamer/dev loanwords or slang in the published body or in the **Причина** line.

| Avoid (slang / jargon) | Prefer |
| ---------------------- | ------ |
| рематч, rematch | новий раунд, «Грати ще», повторна гра |
| лобі, lobby | кімната, екран очікування, очікування гравців |
| пікер, picker | хто обирає слово, гравець що обирає базове слово |
| онлайн-сесія, presence, sync, RTDB | кімната, підключення, гравці в кімнаті |
| UI, UX, багфікс | екран, зручність, виправили |

Also avoid: англіцизми на кшталт «фіча», «апдейт», «краш» — пиши «нова можливість», «оновлення», «аварійне завершення» / «зависання» за змістом.

Internal commit messages may say rematch/lobby; **translate** them into plain Ukrainian before drafting.

### 5. Output format (exact)

Always use this shape so the notes block is one-click copyable:

```markdown
- **Поточний тег:** `vX.Y.Z`
- **Тип релізу:** `patch` | `minor` | `major`
- **Наступний тег:** `vA.B.C`
- **Причина:** one short sentence in Ukrainian
- **Символів:** N/500

\`\`\`text
<Ukrainian what's-new body only — no title, no version line, no metadata>
\`\`\`
```

Optional below the block (not inside it): brief bullet list of commits/files that informed the draft, or warnings.

## Failure / edge cases

| Situation | Behavior |
| --------- | -------- |
| `dev` missing | Stop; ask to create/checkout `dev` or name another branch |
| Tag not ancestor of `dev` | Stop with warning; do not silently use another range |
| `gh` unavailable / auth fails | Try local tags; warn that GitHub was not verified |
| Only internal/tooling commits | Say so; suggest patch with honest minimal player-facing line, or ask whether to ship |
| User asks to publish release | Remind this skill is MVP notes-only; do not run release orchestration unless a later skill/flow covers it |

## Style examples (illustrative)

Good:

```text
• Виправили відображення результатів після «Грати ще»
• Стабільніша онлайн-кімната при підключенні посеред раунду
• Зручніший екран очікування гравців і вибір базового слова
• Дрібні покращення текстів і зручності
```

Avoid (slang or engineer-speak):

```text
• Стабільніший рематч і лобі
• Fix rematch Home leave / presence reconcile
• Refactor lib/online presence helpers
• Bump eslint and vitest
• Sync firebase schema docs
```
