# Architecture decisions (ADR-lite)

Short record of **why** non-obvious multiplayer rules exist. Complements [`online-multiplayer-rules.md`](online-multiplayer-rules.md) (what) and [`known-issues.md`](known-issues.md) (past bugs).

Format: **Decision → Alternatives → Why rejected → Date**

---

## ADR-001: Opt-in rematch (not automatic next round)

- **Decision:** Next round in the same room starts only for players who pressed «Грати ще» or joined `waiting` after rematch. Non-opt-in players stay on frozen UI for their round.
- **Alternatives considered:** Auto-start next round for entire roster; kick non-opt-in players from roster.
- **Why rejected:** Family play needs low pressure — players who finished viewing results should not be dragged into a new round or lose their results screen. Roster history must remain for room stats.
- **Date:** 2026-06 (codified in `online-multiplayer-rules.md`)

## ADR-002: Fresh RTDB read after «Грати ще»

- **Decision:** `optIntoLiveRound()` always performs a fresh read after `markResultsExited` and may call `restartRematchOnlineRound` before routing.
- **Alternatives considered:** Route from cached local session; optimistic navigation to lobby.
- **Why rejected:** RTDB may already be `waiting`/`playing` from a peer's rematch while the viewer still sees `finished`. Stale cache caused wrong screen (play vs lobby vs pick-word) and duplicate rematch writes.
- **Date:** 2026-06 — `lib/online/opt-into-live-round.ts`

## ADR-003: Frozen round view when live round advances

- **Decision:** When `frozenBaseWordRound < liveBaseWordRound`, UI keeps local frozen snapshot (`shouldKeepFrozenResultsOverLiveFinished`) instead of switching to live RTDB session.
- **Alternatives considered:** Always follow live RTDB; force redirect to lobby when status becomes `waiting`.
- **Why rejected:** Non-opt-in players reviewing round N must not jump to round N+1 results/play when another player starts rematch. RTDB cleanup on rematch must not empty their UI.
- **Date:** 2026-06 — `lib/online/frozen-round-view.ts`

## ADR-004: Presence handoff between in-room screens

- **Decision:** In-room navigation (lobby ↔ play ↔ results) sets a presence handoff token so unmount does not mark the player offline.
- **Alternatives considered:** Longer onDisconnect delay; never mark offline on unmount.
- **Why rejected:** Without handoff, brief offline flashes confused other players and triggered false toasts. Never marking offline broke voluntary-leave semantics.
- **Date:** 2026-07 — `lib/online/presence-handoff.ts`

## ADR-005: Passive roster members route to results during `playing`

- **Decision:** `resolvePostJoinRoute()` sends players to play only when `isActiveLivePlayer()` (in `liveRoundPlayerUids`, online, not voluntarily left).
- **Alternatives considered:** All roster members join play on any `playing` status.
- **Why rejected:** Mid-round invitees and non-opt-in roster ghosts are in the room history but not active participants; they should see results/spectator flow, not an empty play screen.
- **Date:** 2026-06 — `lib/online/post-join-route.ts`

## ADR-006: Auto x2 latches on at 3+ live-round players, never off mid-round

- **Decision:** In `auto` mode, `uniqueBonusEnabled` turns on when the **current round's live roster** reaches 3+ (`liveRoundPlayerUids` during `playing`/`finished` rematch rounds; full session roster in round 1) and scores recompute. Once on for a round (`settings.uniqueBonusEnabled === true` in RTDB or latched via join), it **never turns off** during that round even if live roster drops below 3. `off` mode never enables x2 or score recompute for bonus during the round. Each new round resolves fresh from the live roster at round start.
- **Alternatives considered:** Freeze bonus strictly at round-start roster (never enable mid-round); recompute both on and off when roster crosses threshold.
- **Why rejected:** Product spec requires x2 when 3+ join at any stage; disabling mid-round after someone leaves would unfairly strip points already earned under x2 rules.
- **Date:** 2026-06 (updated 2026-07) — `lib/firebase/session-settings.ts`, `uniqueBonusEnabledForActiveRound()`

---

When adding a new ADR: keep it short; link the implementing file; do not duplicate `online-multiplayer-rules.md` tables.
