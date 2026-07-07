# Task template (for AI agents)

Copy this block into a GitHub issue or chat prompt for non-trivial work in `lib/online/`, `firebase/`, or `functions/src/`.

```markdown
## Expected behavior

(What should happen? User-visible outcome.)

## Invariants (must NOT change)

- Opt-in rematch — only opted-in players join the next round
- Frozen round view — non-opt-in players stay on their finished round UI
- Presence — `online` / `hasLeft` / `liveRoundPlayerUids` drive lobby and round membership
- (add area-specific invariants)

## Manual verification

1. …
2. …

## Affected areas

e.g. `lib/online/rematch/`, `app/online/play/[gameId].tsx`

## Regression context

Search `docs/known-issues.md` for similar past bugs.
```

See also [`.github/ISSUE_TEMPLATE/feature-or-bug.md`](../.github/ISSUE_TEMPLATE/feature-or-bug.md).
