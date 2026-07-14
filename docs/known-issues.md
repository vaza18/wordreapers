# Known issues and regression log

Short record of non-trivial bugs that were fixed. Future agents: **search this file** before changing code in the listed areas.

Format: **Date — Symptom → Root cause → Fix → Test**

---

<!-- Add new entries at the top -->

### 2026-07 — Stale 4-char / abandoned rooms never purged

- **Symptom:** Old `waiting`/`playing` rooms (often 4-character codes) lingered forever under `game_sessions`, `player_words`, and `session_word_maps`.
- **Cause:** Scheduled purge only deleted sessions with `purgeAfterAt <= now`, which clients set only on `finished`. Abandoned waiting rooms and stuck playing rounds never got a TTL.
- **Fix:** Add `createdAt` (refreshed on rematch); extend CF to purge abandoned waiting/playing after 7 days (or immediately when `createdAt` missing); delete wholesale `player_words/{gameId}`; one-shot `npm run firebase:purge-orphans`.
- **Test:** `tests/purge-expired-sessions.test.ts`
- **Area:** `functions/src/purge-expired-sessions.ts`, `lib/online/publish-room.ts`, rematch waiting write

### 2026-07 — Intentional leave also toasted «не в грі»

- **Symptom:** When a peer pressed «Вийти» mid-round, remaining players saw both «залишив гру» and «не в грі» (status then correctly showed «вийшов»).
- **Cause:** `runIntentionalLeave` navigated to `/online/left` before `leaveGameSession` wrote `{ online: false, hasLeft: true }`. Play unmount ran `voluntaryLeaveWaitingLobbyIfMember` → `markPlayerOffline` (`online: false` only), so peers briefly saw the background-offline toast, then the leave toast.
- **Fix:** Call `beginVoluntaryLeave` before navigate; `markPlayerOffline` / presence-unmount leave no-op while voluntary leave is in flight; write `leaveGameSession` before caching progress.
- **Test:** `tests/game-session-service.test.ts` (skip offline / unmount offline during voluntary leave)
- **Area:** `lib/firebase/game-session-service.ts`, `app/online/play/[gameId].tsx`

### 2026-07 — Process death on left screen loses «Повернутись до гри»

- **Symptom:** After voluntary leave from a live multiplayer round, staying on the left screen (rejoin still available) and letting the OS kill the app opened home on relaunch — rejoin was no longer one tap away.
- **Cause:** Left-screen parking was only in navigation memory; cold start had solo/paused resume but no pointer for `/online/left`.
- **Fix:** Persist `leftOnlineResume`; cold start opens left after solo/paused checks when the RTDB room/player still exist (playing or finished). Clear on Home or successful rejoin.
- **Test:** `tests/left-online-resume.test.ts`, `tests/resume-interrupted-round.test.ts`
- **Area:** `lib/online/session/left-online-resume.ts`, `lib/app/resolve-interrupted-round-resume.ts`, `app/online/left/[gameId].tsx`

### 2026-07 — Process death wipes paused training / dinner multiplayer pause

- **Symptom:** Leaving the app during a training round (or a mutually paused multiplayer round) and returning later opened the home screen with the round gone.
- **Cause:** Solo state lived only in in-memory Zustand; multiplayer pause lived in RTDB but cold start did not navigate back to play. Existing `activeOnlineRounds` cache required a live `timerEndsAt` and did not cover paused rooms.
- **Fix:** Persist a solo paused snapshot and a paused-online resume pointer on background/pause; cold-start bootstrap restores solo first, else verifies RTDB pause and opens play with the pause modal. Unpaused live multiplayer is not auto-resumed.
- **Test:** `tests/solo-round-snapshot.test.ts`, `tests/paused-online-resume.test.ts`, `tests/resume-interrupted-round.test.ts`
- **Area:** `lib/game/solo-round-snapshot.ts`, `lib/online/session/paused-online-resume.ts`, `lib/app/resolve-interrupted-round-resume.ts`, `app/_layout.tsx`

### 2026-07 — Background «не в грі» almost never lands on real devices

- **Symptom:** During a live multiplayer round, locking the phone or sending the app to background left the player as «в грі» for peers most of the time (Android ~never worked; iOS ~20%). Votes still waited on them. Training auto-pause on the same devices worked; iOS simulators rarely reproduced.
- **Cause:** `markPlayerOffline` awaited `onDisconnect().cancel()` and a `get()` before `update({ online: false })`. Cancel removed the disconnect safety net first; on real-device suspension (common right after AppState `background`) the offline write never ran, while the RTDB socket often stayed alive so `onDisconnect` also never fired. Training pause is a synchronous local state change, so it looked fine.
- **Fix:** Write `online: false` first; cancel onDisconnect and reconcile votes only after that.
- **Test:** `tests/game-session-service.test.ts` (offline write order; cancel hang still sends update)
- **Area:** `lib/firebase/game-session-service.ts`

### 2026-07 — iOS key-press sound only every other tap

- **Symptom:** With button feedback set to sound/both, iOS (simulator and device) plays the key click only on every other press, even when tapping slowly. Haptics fire every press; Android sound is fine.
- **Cause:** `playButtonSoundNow` called `seekTo(0)` without awaiting, then `play()` immediately. On iOS AVPlayer stays at the end after a finished clip, so `play()` before seek completes is a silent no-op; the deferred seek leaves the player at 0 for the next tap.
- **Fix:** `replayFromStart` awaits `seekTo(0)` then calls `play()` (button and word sounds).
- **Test:** `tests/game-feedback-replay.test.ts`
- **Area:** `lib/feedback/replay-from-start.ts`, `lib/feedback/game-feedback.ts`

### 2026-07 — Pause vote waits on player who backgrounded the app

- **Symptom:** After one player sent the app to the home screen or locked the phone (without force-killing), peers still saw them as «в грі» and pause / other votes waited for their response.
- **Cause:** `usePlayerOnlinePresence` only re-marked `online` on AppState `active`; background did not call `markPlayerOffline`. While the RTDB socket stayed alive, `onDisconnect` did not fire. Open `pauseVote` also had no reconcile when the required set became empty.
- **Fix:** AppState `background` → `markPlayerOffline` (no `hasLeft`); reconnect → online only if AppState is `active`; `reconcileOpenSessionVotes` after offline/leave and on peer play screen; toasts `player_went_offline` / `player_returned`; UI label «не в грі».
- **Test:** `tests/app-presence-state.test.ts`, `tests/play-toast-events.test.ts`, `tests/session-votes-service.test.ts`, `tests/online-invariants.test.ts`
- **Area:** `lib/online/presence/use-player-online-presence.ts`, `lib/online/presence/app-presence-state.ts`, `lib/firebase/game-session-service.ts`, `lib/firebase/session-votes-service.ts`, `hooks/useReconcileOpenVotesOnPresence.ts`

### 2026-07 — After leave→rejoin→background, peer sees «не в грі» then «знову в грі»

- **Symptom:** Player leaves the round early, returns, then backgrounds the app. Peer briefly gets «не в грі» and immediately «знову в грі»; standings still show «в грі». Entering a word then backgrounding did not reproduce.
- **Cause:** Background sets `online: false` without `hasLeft`, which makes `shouldRejoin` true. After leave→rejoin the play screen remounts with a fresh `stalePresenceReconcileRef`, so the first background always ran `reconcilePlayerPresence` → `rejoinExistingPlayer` / `markPlayerOnline` and resurrected presence. Continuous sessions often already had the reconcile ref set, masking the bug.
- **Fix:** Skip presence reconcile / `markPlayerOnline` while AppState is not `active`; presence write queue so offline cancels in-flight online writes.
- **Test:** `tests/reconcile-player-presence.test.ts`, `tests/presence-write-queue.test.ts`, `tests/app-presence-state.test.ts`, `tests/live-round-screen-actions.test.ts`
- **Area:** `lib/online/presence/reconcile-player-presence.ts`, `hooks/useLiveRoundPlayScreen.ts`, `lib/online/presence/presence-write-queue.ts`, `lib/firebase/game-session-service.ts`

### 2026-07 — Draft letter visible during fly on Android (RN transparent color)

- **Symptom:** With letter-fly effects on, the draft glyph appears immediately (opaque) when the fly starts instead of staying hidden until handoff. Reproduced on Android 1.4.0 (build 41); iOS simulator looked correct.
- **Cause:** `DraftDisplayText` hid revealing glyphs with nested `Text` `color: 'transparent'`. On Android RN 0.81+, color `0` is treated as `UndefinedColor`, so the parent draft color is used and the glyph stays visible. iOS uses a different undefined sentinel, so the bug did not show there.
- **Fix:** Use `#FFFFFF00` (`DRAFT_REVEALING_CHAR_COLOR`) instead of `transparent` / zero ARGB.
- **Test:** `tests/draft-letter-reveal.test.ts`, `components/__tests__/DraftDisplayText.test.tsx`
- **Area:** `components/DraftDisplayText.tsx`, `constants/compose-draft.ts`

### 2026-07 — iOS `RNFBAppCheck` fatal module error after clean prebuild

- **Symptom:** Xcode reports `fatal error: module 'RNFBAppCheck' … is not defined in any loaded module map` while compiling the bridging-header PCH; build may still show `Build Succeeded` with `1 error(s)`. Cleaning DerivedData / `prebuild --clean` does not help.
- **Cause:** (1) `with-ios-firebase-native-init` hardcoded the native folder `Slovozbirachi`. With `APP_VARIANT=production` (e.g. `.env.local`), Expo `name` is `Wordreapers`, so the plugin wrote `FirebaseNativeInit` into an orphan folder and never patched `Wordreapers-Bridging-Header.h`. (2) Expo dangerous mods run **last-registered first**, so listing the strip plugin _after_ `@react-native-firebase/app-check` let RNFB re-add `#import <RNFBAppCheckModule.h>` / Swift `sharedInstance()` after the strip. Combined with `CLANG_ENABLE_MODULES=NO` on `RNFBAppCheck`, the bridging-header PCH fails.
- **Fix:** Resolve paths from `modRequest.projectName`; list the native-init plugin _before_ RNFB in `app.config.js`; strip RNFB Swift init and expose ObjC `WRConfigureFirebaseNative()` via the real bridging header.
- **Test:** `tests/with-ios-firebase-native-init.test.ts`
- **Area:** `plugins/with-ios-firebase-native-init.cjs`, `app.config.js`

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

### 2026-07 — Draft letter fly-to-draft animation (compose panel)

- **Symptom:** Ghost fly missing or wrong landing; rapid typing cancelled flies; draft glyphs stuck transparent; vertical misalignment when draft shrinks.
- **Cause:** Reveal tied to fly completion; shared animation state; width-based landing ignored `adjustsFontSizeToFit` and `letterSpacing`; `Text` filled full draft row height so flex centering had no effect.
- **Fix:** Independent reveal timer + instant handoff at `DRAFT_FLY_DURATION_MS`; per-char concurrent flies; landing from measured draft `Text` + `draftFlyGlyphTopLeftFromLineLayout`; flex-centered draft wrapper; start point aligned to key label geometry.
- **Test:** `tests/draft-fly-layout.test.ts`, `tests/draft-letter-fly.test.ts`, `tests/draft-letter-reveal.test.ts`, `tests/draft-text-scale.test.ts`
- **Area:** `hooks/useDraftLetterFly.ts`, `lib/game/draft-fly-layout.ts`, `components/DraftDisplayText.tsx`, `components/online/OnlinePlayComposePanel.tsx`

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

### 2026-07 — Decorative animations ignored OS Reduce Motion

- **Symptom:** Timer pulse, confetti, letter fly, and other decorative animations ran even when the device had Reduce Motion enabled (or when users wanted fewer effects).
- **Cause:** No centralized visual-effects policy; only legacy per-toggle timer/victory settings without OS accessibility integration.
- **Fix:** Added `lib/settings/visual-effects.ts` with Auto / Selective / Off modes, `useReduceMotion`, and `useResolvedVisualEffects`; wired all decorative animation consumers to resolved flags.
- **Test:** `tests/visual-effects.test.ts`
- **Area:** `lib/settings/visual-effects.ts`, `store/settings-store.ts`, `hooks/useReduceMotion.ts`, `hooks/useResolvedVisualEffects.ts`

### 2026-07 — Confetti fired before OS Reduce Motion was read

- **Symptom:** With Reduce Motion on and visual effects in Auto, victory confetti still played on results screens.
- **Cause:** `useReduceMotion` defaulted to `false` before `AccessibilityInfo.isReduceMotionEnabled()` resolved; `celebrate()` ran on first paint and `hasCelebratedRef` blocked the corrected path.
- **Fix:** Treat unknown OS state as reduce motion enabled in `resolveVisualEffects`; gate `VictoryConfettiHost` on `victoryCelebration`.
- **Test:** `tests/visual-effects.test.ts` (`null` OS state)
- **Area:** `hooks/useReduceMotion.ts`, `lib/settings/visual-effects.ts`, `components/VictoryConfetti.tsx`

### 2026-07 — «Нова гра» crashed with useInsertionEffect prevent-remove

- **Symptom:** Opening online setup («Нова гра») logged `useInsertionEffect must not schedule updates` and `Can't perform a React state update on a component that hasn't mounted yet` from `useSyncedStackBack`.
- **Cause:** Prevent-remove registration called `setPreventRemove` (React state) inside `useInsertionEffect`, which React 19 forbids.
- **Fix:** Register/clear prevent-remove in `useEffect`, matching expo-router's `usePreventRemove`.
- **Test:** `tests/use-synced-stack-back.test.tsx`
- **Area:** `hooks/useSyncedStackBack.ts`

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
