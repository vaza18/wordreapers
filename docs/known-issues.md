# Known issues and regression log

Short record of non-trivial bugs that were fixed. Future agents: **search this file** before changing code in the listed areas.

Format: **Date — Symptom → Root cause → Fix → Test**

---

<!-- Add new entries at the top -->

### 2026-07 — Presence handoff between online screens

- **Symptom:** Navigating lobby → play → results in the same room briefly marked the player offline; others saw them leave/rejoin.
- **Cause:** `usePlayerOnlinePresence` always called disconnect cleanup on unmount, even for in-room screen transitions.
- **Fix:** Added `lib/online/presence-handoff.ts`; call `handoffPlayerPresence()` before navigating, and `consumePresenceHandoff()` on unmount to skip offline marking.
- **Test:** `tests/presence-handoff.test.ts`
- **Area:** `lib/online/presence/presence-handoff.ts`, `lib/online/presence/use-player-online-presence.ts`

### 2026-07 — Left players visible in rematch waiting lobby

- **Symptom:** Players who voluntarily left still appeared in the rematch waiting lobby, including when `online: true` was resurrected by presence sync.
- **Cause:** `isLobbyVisiblePlayer()` only checked roster membership, not `hasLeft`.
- **Fix:** Return `false` when `player.hasLeft === true` in `lib/online/rematch-waiting-lobby.ts`.
- **Test:** `tests/rematch-waiting-lobby.test.ts`
- **Area:** `lib/online/rematch/rematch-waiting-lobby.ts`

### 2026-07 — False “alone in game” toast at round start

- **Symptom:** “Alone in game” toast fired at round 1 start when an opponent was briefly offline during presence sync.
- **Cause:** `alone_in_game` detection compared active online participants without distinguishing expected live-round roster members who were temporarily offline.
- **Fix:** Added `isExpectedLiveRoundParticipant()` in `lib/online/live-round-membership.ts`; require a `player_left` event and zero expected opponents before toasting alone.
- **Test:** `tests/play-toast-events.test.ts`
- **Area:** `lib/online/play-toast-events.ts`, `lib/online/live-round-membership.ts`

### 2026-07 — Spurious “player joined” toasts at round start

- **Symptom:** False `player_joined` toasts when lobby participants synced presence as a live round started.
- **Cause:** `becameActiveInLiveRound()` fired for initial presence sync, not genuine mid-round joins/rejoins.
- **Fix:** Added `shouldToastRosterPlayerJoined()` in `lib/online/play-toast-events.ts` to filter lobby sync vs real joins.
- **Test:** `tests/play-toast-events.test.ts`
- **Area:** `lib/online/play-toast-events.ts`

### 2026-06 — Frozen round results overwritten when rematch advances

- **Symptom:** Player still reviewing round N results was switched to round N+1 when another player started a rematch and RTDB advanced `baseWordRound`.
- **Cause:** Play/results screens replaced local frozen snapshot with live RTDB session whenever status changed, even when live round was ahead of what the viewer was reviewing.
- **Fix:** Added `shouldKeepFrozenResultsOverLiveFinished()` and `resolveRoundEndSessionSnapshot()` to keep the frozen earlier round when `frozenBaseWordRound < liveBaseWordRound`.
- **Test:** `tests/resolve-round-end-session-snapshot.test.ts`, `tests/frozen-round-view.test.ts`
- **Area:** `lib/online/session/resolve-round-end-session-snapshot.ts`, `lib/online/session/frozen-round-view.ts`

### 2026-06 — Passive roster member routed to play on late join

- **Symptom:** Joining or re-entering an active round sent offline/passive roster members to the play screen instead of results, even when they were not in `liveRoundPlayerUids`.
- **Cause:** `resolvePostJoinRoute()` routed all `status === 'playing'` sessions to play unconditionally.
- **Fix:** Gate play routing with `isActiveInLivePlayingRound()` (online, not `hasLeft`, in live round roster).
- **Test:** `tests/post-join-route.test.ts`
- **Area:** `lib/online/post-join-route.ts`, `lib/online/is-active-in-live-playing-round.ts`

### 2026-06 — Organizer waiting room deleted on app background

- **Symptom:** Organizer’s waiting lobby disappeared when locking the phone or backgrounding the app, not only when explicitly leaving.
- **Cause:** `useOrganizerAbandonWaitingOnExit` listened to `AppState` `'background'` and ran `abandonWaitingGameSession`.
- **Fix:** Removed AppState listener; abandon only on back-navigation actions (`GO_BACK`, `POP`, `POP_TO`).
- **Test:** `tests/use-organizer-abandon-on-exit.test.tsx`
- **Area:** `lib/online/use-organizer-abandon-on-exit.ts`

### 2026-06 — Unique bonus (x2) changed mid-round when roster grew

- **Symptom:** x2 unique-word scoring flipped on/off mid-round when a new player joined via invite QR (roster size crossed the 3-player threshold).
- **Cause:** `uniqueBonusEnabled` was recomputed from current player count during `playing`/`finished`, toggling x2 **off** when roster shrank below 3 after it had been enabled.
- **Fix:** `uniqueBonusEnabledForActiveRound()` latches x2 on at 3+ in `auto` mode (lobby or mid-round) and never turns off mid-round; `off` mode skips bonus recompute entirely.
- **Test:** `lib/online/__tests__/live-standings.test.ts`, `lib/online/__tests__/online-word-display.test.ts`
- **Area:** `lib/firebase/session-settings.ts`

### 2026-07 — Rematch standings and x2 counted passive roster members

- **Symptom:** During round 2+, a player still reviewing round-1 results appeared in live «Рейтинг» with 0 points; x2 applied as if 3 players were in the round.
- **Cause:** `buildLiveStandingsFromSession` listed all `session.players`; `playerCountForUniqueBonus` used full roster size instead of `liveRoundPlayerUids` for rematch rounds.
- **Fix:** Filter live standings to `liveParticipantIds`; derive auto x2 from `liveRoundPlayerUids` (or waiting-lobby opt-in before start) in rematch rounds.
- **Test:** `lib/online/__tests__/live-standings.test.ts`, `tests/session-settings-unique-bonus.test.ts`, `tests/online-invariants.test.ts`
- **Area:** `lib/online/live-standings.ts`, `lib/firebase/session-settings.ts`

---

## Template (copy for new entries)

```
### YYYY-MM — Short title

- **Symptom:** What users or tests saw
- **Cause:** Why it happened
- **Fix:** What changed (file or behavior)
- **Test:** `tests/example.test.ts` or manual repro steps
- **Area:** e.g. `lib/online/rematch-waiting-lobby.ts`
```
