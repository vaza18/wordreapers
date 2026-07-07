# Presence (`lib/online/presence/`)

Micro-invariants for this folder only. Full rules: [`docs/online-multiplayer-rules.md`](../../../docs/online-multiplayer-rules.md) §5, §7.

## Must not break

- **Presence handoff** (ADR-004) — in-room navigation (lobby ↔ play ↔ results) must call `handoffPlayerPresence()` before navigate; unmount must not mark offline when handoff is consumed.
- `online` / `hasLeft` / `liveRoundPlayerUids` drive lobby visibility and round membership — see `live-round-membership.ts`.
- Voluntary leave: `hasLeft === true` **and** `online === false`. Stale `hasLeft` while `online === true` still counts as active.
- Do not toast `player_joined` for lobby presence sync at round start; do not toast `alone_in_game` when expected roster members are briefly offline.

## Tests

- `tests/online-invariants.test.ts` (§5, §7)
- `tests/presence-handoff.test.ts`
- `tests/play-toast-events.test.ts`

## Regression log

Search [`docs/known-issues.md`](../../../docs/known-issues.md) before changing presence hooks or `live-round-membership.ts`.
