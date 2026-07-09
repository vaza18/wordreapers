# Known issues and regression log

Short record of non-trivial bugs that were fixed. Future agents: **search this file** before changing code in the listed areas.

Format: **Date — Symptom → Root cause → Fix → Test**

---

<!-- Add new entries at the top -->

### 2026-07 — Solo/online freeze at 00:00 with add-time modal open

- **Symptom:** On the last seconds of a solo round, opening the add-time picker left the play screen stuck at `00:00` with no taps responding. Online could finish under the local picker before propose.
- **Cause:** Solo `PlayTimerHeader` called `onTimeUp` → `finishRound` while `AddTimeModal` stayed open, stacking `GameTimeUpModal` under another native `Modal`. Solo `addTime` also added to a past `endsAt` (or no-op after finish). Online finish tick deferred only for RTDB `addTimeVote`, not `showAddTimeModal`.
- **Fix:** Local `deferTimeUp` / solo cancel-at-zero finish; `addTime` via `computeExtendedTimerEndsAt`; client finish tick uses `shouldDeferClientTimerFinish` (picker or vote). Cross-device durable defer remains `addTimeVote` only.
- **Test:** `tests/organizer-solo-add-time.test.ts`, `tests/add-time-vote.test.ts`, `tests/game-session-service.test.ts`
- **Area:** `components/online/PlayTimerHeader.tsx`, `app/online/solo/[gameId].tsx`, `store/organizer-solo-store.ts`, `app/online/play/[gameId].tsx`, `lib/online/voting/add-time-vote.ts`

### 2026-07 — Letter fly animation degrades with large accepted-word lists

- **Symptom:** After ~60 accepted words, the ghost letter fly-to-draft animation became nearly invisible on Android (and faster on iOS). Worsened with more words.
- **Cause:** Each draft keystroke re-rendered the word list, ran triple animated FlatList prefix scrolls, and invalidated all visible rows; fly animation competed for UI thread time. `usedKeyIndices` was recreated every render, breaking `LetterKeyboard` memo. `entranceNormalizes` grew without pruning.
- **Fix:** Memoized `DraftLetterFlyOverlay` with animation stop/generation guard; prefix-aware row memo; debounced non-animated prefix scroll; pruned entrance set after row animation; Android FlatList tuning (`removeClippedSubviews`, smaller window).
- **Test:** `tests/word-list-row-memo.test.ts`, `tests/word-list-entrance.test.ts`
- **Area:** `components/online/OnlinePlayComposePanel.tsx`, `components/WordList.tsx`, `hooks/useVirtualWordListProps.ts`

### 2026-07 — Letter fly-to-draft animation missing after compose-panel refactor

- **Symptom:** Pressing a letter key no longer showed the ghost letter flying into the draft field. After restore, landing x drifted as the draft grew.
- **Cause:** (1) Commit that removed ConnectivityContext also stripped fly wiring from `OnlinePlayComposePanel`. (2) Landing used a fixed `fontSize * 0.6` advance and ignored `adjustsFontSizeToFit` shrink.
- **Fix:** Restored fly animation; land using measured draft text width from `onTextLayout` via `draftLetterFlyEndpoints`.
- **Test:** `tests/draft-letter-fly.test.ts`
- **Area:** `components/online/OnlinePlayComposePanel.tsx`, `lib/game/draft-letter-fly.ts`

### 2026-07 — Organizer stuck in rematch lobby when picker starts round 2

- **Symptom:** After round 1, organizer waits in rematch lobby while another opted-in player picks the base word and starts round 2. Organizer stays on the waiting lobby (`Очікуємо, поки … почне гру`); picker may enter play alone. Firebase logs `update at / failed: permission_denied` and later `session_word_maps/... permission_denied` on word submit.
- **Cause:** (1) RTDB `status` rules authorized `waiting → playing` using **stored** `root…/baseWordPickerUid`, ignoring `newData.parent().baseWordPickerUid` from the same atomic start write — after picker rotation the stored uid still pointed at the organizer while the client synced the real picker in the same update. (2) Round-start player patch wrote other players' `hasLeft`. (3) Lobby presence unmount marked the organizer offline before play navigation. (4) **`settings` rules blocked `uniqueBonusEnabled: true → false`** at round start when rematch waiting kept x2 for full roster (3) but only 2 players opted in — the client sends recalculated settings in the same atomic update, so the whole `update at /` failed.
- **Fix:** Rules: allow `waiting → playing` when `auth.uid == newData.parent().baseWordPickerUid`; allow `settings.uniqueBonusEnabled` to change on `waiting → playing` when other settings fields are unchanged. Client: sync picker uid in start multi-path; restrict peer player patches; keep lobby presence through `playing`; re-read RTDB after auto-join. **Deploy rules:** `npm run firebase:deploy:rules`.
- **Test:** `tests/firebase/database.rules.test.ts`, `tests/players-patch-for-round-start.test.ts`, `tests/live-round-screen-actions.test.ts`, `tests/should-lobby-auto-join-live-round.test.ts`
- **Area:** `lib/firebase/game-session-service.ts`, `lib/online/presence/players-patch-for-round-start.ts`, `lib/online/live-round-screen-actions.ts`, `hooks/useLiveRoundLobbyScreen.ts`, `app/online/lobby/[gameId].tsx`

### 2026-07 — Finished results missing winners and word avatars

- **Symptom:** After reconnect at round end, results showed words and x2 badges but headline stayed «Гра завершена», no winner, no avatars next to words.
- **Cause:** `buildLiveStandingsFromSession()` filtered via `liveParticipantIds()`, which returns nobody when `status !== 'playing'`. Results always use word-map standings when `wordPlayers` exists, so finished sessions got empty standings → `isSoloStandings([])` hid word authors.
- **Fix:** Added `finishedRoundParticipantIds()` for finished sessions; `buildLiveStandingsFromSession()` uses live roster scope without online/presence gates when not `playing`.
- **Test:** `lib/online/__tests__/live-standings.test.ts`, `tests/online-results-data.test.ts`
- **Area:** `lib/online/live-standings.ts`, `lib/online/presence/live-round-membership.ts`

### 2026-07 — Overtake toast skipped at equal score (word tie-breaker)

- **Symptom:** When a player took 1st place with the same score as 2nd but more words, 2nd place got no “overtook you” toast (3rd place did).
- **Cause:** `detectRankEvents()` compared only total score (or word count when x2 off), ignoring the word-count tie-breaker used by live standings.
- **Fix:** Pairwise rank toasts now use `compareStandings()` — same rules as the header rank (score → words → tie).
- **Test:** `tests/play-toast-events.test.ts` — “detects overtakes when equal score but fewer words”
- **Area:** `lib/online/play-toast-events.ts`

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
