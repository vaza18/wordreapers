# Rematch (`lib/online/rematch/`)

Micro-invariants for this folder only. Full rules: [`docs/online-multiplayer-rules.md`](../../../docs/online-multiplayer-rules.md) §1, §3.

## Must not break

- **Opt-in only** (ADR-001) — next round starts for players who pressed «Грати ще» or joined rematch `waiting` with `online: true`.
- **Fresh RTDB read** (ADR-002) — `optIntoLiveRound()` never routes from stale cache; always re-read after `markResultsExited`.
- Non-opt-in players: `online: false`, `hasLeft: false` — stay in roster, **not** in rematch lobby list.
- `resultsExitedBy` becomes durable rematch opt-in latch on `finished → waiting` (cleared only at round start).

## Tests

- `tests/online-invariants.test.ts` (§1, §3)
- `tests/bootstrap-rematch-waiting-from-archive.test.ts`
- `tests/rematch-waiting-lobby.test.ts`

## Regression log

Search [`docs/known-issues.md`](../../../docs/known-issues.md) before changing rematch waiting lobby or opt-in flow.
