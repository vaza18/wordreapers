# Presence (`lib/online/presence/`)

Micro-invariants for this folder only. Full rules: [`docs/online-multiplayer-rules.md`](../../../docs/online-multiplayer-rules.md) §5, §7.

## Must not break

- **Lobby presence policy** — always `background-only` via `lobbyPresenceOfflinePolicy` while the lobby screen is mounted; never flip to play `inactive` policy on `waiting → playing` (remount cleanup false-marks offline before handoff).
- `online` / `hasLeft` / `liveRoundPlayerUids` drive lobby visibility and round membership — see `live-round-membership.ts`.
- Voluntary leave: `hasLeft === true` **and** `online === false`. Stale `hasLeft` while `online === true` still counts as active.
- **Intentional leave ≠ background offline** — `beginVoluntaryLeave` before navigate to left; `markPlayerOffline` / presence-unmount must not write `online: false` alone while leave is in flight (avoids «не в грі» toast before «залишив гру»).
- **Background ≠ left** — AppState `background` sets `online: false` only; `hasLeft` stays false. Foreground `active` restores online. RTDB reconnect must not remake online while still backgrounded.
- **Background ≠ shouldRejoin** — `online: false` without `hasLeft` must not run `reconcilePlayerPresence` while AppState is not `active` (leave→rejoin remount otherwise resurrects «в грі»).
- **Solo UI** — `hasOnlineOpponent` requires peer `online === true` (not score lag). Offline «не в грі» and voluntary leave both yield solo pause/end/add-time labels.
- Do not toast `player_joined` for lobby presence sync at round start; do not toast `alone_in_game` when expected roster members are briefly offline (offline/returned toasts are OK).

## Tests

- `tests/online-invariants.test.ts` (§5, §7)
- `tests/presence-handoff.test.ts`
- `tests/play-toast-events.test.ts`
- `tests/app-presence-state.test.ts`
- `tests/lobby-presence-policy.test.ts`
- `tests/use-player-online-presence.test.tsx`

## Regression log

Search [`docs/known-issues.md`](../../../docs/known-issues.md) before changing presence hooks or `live-round-membership.ts`.
