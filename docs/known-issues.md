# Known issues and regression log

Short record of non-trivial bugs that were fixed. Future agents: **search this file** before changing code in the listed areas.

Format: **Date — Symptom → Root cause → Fix → Test**

---

<!-- Add new entries at the top -->

### 2026-07 — Second «Грати ще» reopens rematch and both pick different words (AH2TN)

- **Symptom:** After round N results, first rematcher opens waiting + pick-word; second taps «Грати ще» and also lands on pick-word with «Гравці (1)» only self. Each commits a different base word; lobbies disagree on roster and word.
- **Cause:** Second client still saw (or treated) RTDB as `finished` and ran full `rematchFinishedSessionToWaiting` via non-atomic `update`, rewriting `players` (peer → offline), stealing `baseWordPickerUid`, and clearing the first rematcher’s word. `players/.write` while status exists allows that overwrite even when the room was already `waiting`. Log marker: second client `opened rematch lobby` instead of `joined rematch lobby (peer already opened waiting)`.
- **Fix:** Rematch `finished → waiting` is a transaction that aborts unless status is still `finished`; if waiting is already open (fresh read or stale-finished abort), join path only — latch leaf + word cleanup, no players/picker/word rewrite.
- **Test:** `tests/game-session-service.test.ts` (already-waiting join; stale finished abort)
- **Area:** `lib/firebase/game-session-service.ts` (`rematchFinishedSessionToWaiting`)

### 2026-07 — Rematch starter solo UI while peer votes (WAGTJ round 2)

- **Symptom:** After rematch start, one client looks fully solo (stats explain «Знайдено N слово», no rank/standings); peer’s early-finish vote lists both as «в грі» and waits on the solo client. Not a modal z-index issue.
- **Cause:** `liveRoundPlayerUids` at start can omit the late rematcher (brief offline / latch race). Peer still reaches play and scores, but starter’s `hasMultiplayerRound` only treated **online** peers as multiplayer when uids lagged — offline+scored peer kept solo chrome; vote UI depended on a fresh session the starter might not surface over stats.
- **Fix:** `hasMultiplayerRound` also counts rematch peers with `wordCount`/`score` > 0; play `shouldRejoin` self-heals when online/scoring but missing from `liveRoundPlayerUids`; lobby auto-join retries roster append; dismiss stats on multipplayer/vote; log `liveUids` on start.
- **Test:** `tests/live-round-membership.test.ts`, `tests/should-rejoin-live-playing-round.test.ts`
- **Area:** `lib/online/presence/live-round-membership.ts`, `lib/online/live-round-screen-actions.ts`, `hooks/useLiveRoundLobbyScreen.ts`, `app/online/play/[gameId].tsx`

### 2026-07 — False «rejoined (was offline)» right after start (WAGTJ)

- **Symptom:** Dev logs show both players `rejoined room (was offline) status=playing` within ~200ms of `started round`, though they were in the lobby and never backgrounded.
- **Cause:** Lobby `usePlayerOnlinePresence` switched `offlinePolicy` to `background-and-inactive` when RTDB became `playing` while still on the lobby screen. That remounted the presence effect; cleanup ran without a play handoff and wrote `online: false`. Play then reconciled via `rejoinExistingPlayer`.
- **Fix:** Lobby always uses `lobbyPresenceOfflinePolicy()` → `background-only` (stable across `waiting → playing`). Play still owns `inactive→offline` after handoff navigation.
- **Test:** `tests/lobby-presence-policy.test.ts`, `tests/use-player-online-presence.test.tsx`
- **Area:** `lib/online/presence/lobby-presence-policy.ts`, `app/online/lobby/[gameId].tsx`

### 2026-07 — Late joiner «Гравці (1)» / blink after first rematcher already picked (JZ4Y5)

- **Symptom:** Round N: organizer (scheduled + first rematcher) picks base word; late joiner’s lobby shows only themselves + Start / steals pick. First rematcher’s list blinks when the peer joins; peer still sees both.
- **Cause:** (1) `hasLeft` short-circuited rematch visibility/eligibility and `shouldClearLobbyBaseWordForPicker` even when latch / `baseWordPickerUid` / committed word marked durable opt-in — late joiner treated the peer as absent (rule 1). (2) Every `setPlayerOnlinePresence` ran `reconcileLobbyPickerState`, so the joiner’s online write raced a briefly-offline / stale-hasLeft peer and cleared the rightful word (list blink). (3) Pick-word (non-`fromLobby`) used default `inactive→offline`, marking the waiting-phase picker offline under multi-sim focus.
- **Fix:** Durable rematch seat (`isRematchDurableLobbyOptIn`) survives stale `hasLeft` for lobby visibility + picker eligibility + word clear; stop picker reconcile on presence online writes; pick-word uses `background-only` offline policy like lobby.
- **Test:** `tests/rematch-waiting-lobby.test.ts`, `tests/lobby-base-word-picker-reconcile.test.ts`, `tests/online-base-word-picker.test.ts`
- **Area:** `lib/online/rematch/rematch-waiting-lobby.ts`, `lib/online/base-word-picker.ts`, `lib/firebase/game-session-service.ts`, `app/online/pick-word/[gameId].tsx`

### 2026-07 — Lobby shows peer offline while they still have Start / base word (multi-sim)

- **Symptom:** Rematch lobby: peer has chosen base word + «Почати гру»; other client shows 📵 on that peer and «Чекаємо, поки … обере базове слово» with no word. Peer is not actually offline.
- **Cause:** Focusing the other iOS simulator sets AppState `inactive` → `markPlayerOffline`. That policy is required for lock-screen votes during `playing`, but in waiting lobby it creates false offline and stale «waiting for pick» UI when the listener also missed `baseWord`.
- **Fix:** Lobby / non-playing presence uses `background-only` offline policy (`inactive` ignored); play keeps `background-and-inactive`. Lobby re-heals RTDB every 2s while waiting for a rematch base word.
- **Test:** `tests/app-presence-state.test.ts`, `tests/use-player-online-presence.test.tsx`
- **Area:** `lib/online/presence/app-presence-state.ts`, `lib/online/presence/use-player-online-presence.ts`, `app/online/lobby/[gameId].tsx`

### 2026-07 — Late rematch joiner thinks they are alone / steals pick (visibility)

- **Symptom:** Rightful first rematcher (also scheduled) opens round N and picks; late joiner’s lobby shows «Гравці (1)» only themselves and treats rule 1 (alone → may pick), overwriting or racing the base word. Peer lobby correctly shows both.
- **Cause:** Multi-sim focus marks the first rematcher `online: false`. Visibility/eligibility required latch or committed `chosenBy`+word; while they are still on pick-word (no word yet) and latch missing from the late joiner’s snapshot, they vanish → late joiner becomes sole eligible picker.
- **Fix:** Treat `baseWordPickerUid` as rematch opt-in for lobby visibility + `waitingLobbyOptInUids` / picker eligibility; heal lobby RTDB on `optedIn=1`; keep latch-on-inactive from prior fix.
- **Test:** `tests/rematch-waiting-lobby.test.ts`, `tests/online-base-word-picker.test.ts`, `tests/live-round-player-uids.test.ts`
- **Area:** `lib/online/rematch/rematch-waiting-lobby.ts`, `lib/online/presence/live-round-membership.ts`, `app/online/lobby/[gameId].tsx`

### 2026-07 — Rematch picker lobby shows only self while peer sees both (YZS46)

- **Symptom:** First rematcher (organizer) sits in rematch lobby and sees both players; second (picker) sees «Гравці (1)» only themselves and can Start. Same room/word.
- **Cause:** Multi-sim focus marks first rematcher `online: false`. Lobby list uses RTDB `online` / `resultsExitedBy` / chosenBy — not the local `rematchOptInLatched` that keeps the first player on the lobby screen. `reconcilePlayerPresence` skipped _all_ work (including latch refresh) while AppState was inactive; rematch `permission_denied` already-waiting path also returned without ensuring the actor latch leaf.
- **Fix:** Always `markResultsExited` in reconcile even when inactive (still skip online rejoin); confirm latch after rematch success and on already-waiting catch; await latch again before navigating into rematch waiting from «Грати ще». Do **not** weaken inactive→offline for playing votes.
- **Test:** `tests/reconcile-player-presence.test.ts`, `tests/rematch-waiting-lobby.test.ts`
- **Area:** `lib/online/presence/reconcile-player-presence.ts`, `lib/online/rematch/opt-into-live-round.ts`, `lib/firebase/game-session-service.ts`

### 2026-07 — After screen lock, play UI frozen but taps still submit words

- **Symptom:** Player locks screen mid-round; after unlock UI looks frozen (timer stuck, no key press scale, draft empty, ghost letter floating, wordlist not updating) while taps still credit words in RTDB (peer standings ahead of local list).
- **Cause:** iOS `inactive` pauses JS timer ticks and can stall native-driver `Animated` (letter fly / press scale). Touch + Firebase still run; fly handoff/`setTimeout` leaves glyphs hidden and a stuck ghost. Own-words listener may lag behind a successful submit.
- **Fix:** On AppState `active`: refresh server clock immediately; clear draft flies + remount letter keyboard; reset press scales; refetch own `player_words` when remote has keys local lacks.
- **Test:** `tests/compose-resume-heal.test.ts`
- **Area:** `hooks/useServerNow.ts`, `hooks/usePressScale.ts`, `hooks/usePlaySessionSubscriptions.ts`, `components/online/OnlinePlayComposePanel.tsx`, `lib/game/compose-resume-heal.ts`

### 2026-07 — Time-up «Переглянути результати» loops error; no way home

- **Symptom:** Game finished modal shows «Не вдалося відкрити результати»; retry repeats the same error; backdrop cannot dismiss; no Home.
- **Cause:** `navigateToResults` treated finish `timeout` as hard fail (no local archive fallback). Archive seed required `status === 'finished'` only. Metro reload logs are unrelated.
- **Fix:** On timeout / rematch_advanced, seed local finished archive (coerce playing → finished); skip long ensure when local pin exists; show Home on the time-up modal when error is set.
- **Test:** `tests/ensure-rematch-advanced-results-archive.test.ts`
- **Area:** `app/online/play/[gameId].tsx`, `lib/online/ensure-rematch-advanced-results-archive.ts`, `components/GameTimeUpModal.tsx`

### 2026-07 — Peer screen lock at round start drops them / starter hung on spinner

- **Symptom:** Player 2 locks the phone in rematch lobby; player 1 starts (or is mid-start) and sees a blank loading screen with settings gear; player 2 unlocks and is already in the live round while player 1 stays stuck.
- **Cause:** `liveRoundPlayerUids` at `waiting → playing` used only `online === true`. Screen lock → `online: false` excluded opted-in peers; empty/partial roster broke `isActiveLivePlayer` / navigation (starter can land on results/lobby loading).
- **Fix:** `waitingLobbyOptInUids` includes rematch latch / chosenBy; `liveRoundPlayerUidsForRoundStart` always adds the starter.
- **Test:** `tests/live-round-player-uids.test.ts`
- **Area:** `lib/online/presence/live-round-membership.ts`, `lib/online/start-game-session-write.ts`

### 2026-07 — «Грати ще» leaves joiner on results for 10+s while peer lobby already shows them

- **Symptom:** Second player taps «Грати ще»; first player’s rematch lobby lists them quickly, but the joiner stays on results for many seconds.
- **Cause:** `optIntoLiveRound` awaited full presence (`rejoin` + duplicate `markPlayerOnline` + `reconcileLobbyPickerState`) before `router.replace`.
- **Fix:** For already-`waiting` rematch, kick presence in the background and navigate from the fresh session read; await presence only for live `playing`. Drop redundant `markPlayerOnline` after `rejoinExistingPlayer`; do not await picker reconcile on the presence path.
- **Test:** `tests/opt-into-live-round.test.ts`, `tests/reconcile-player-presence.test.ts`
- **Area:** `lib/online/rematch/opt-into-live-round.ts`, `lib/online/presence/reconcile-player-presence.ts`, `lib/firebase/game-session-service.ts`

### 2026-07 — Second rematcher steals pick-word / clears rightful word (DSSN2)

- **Symptom:** Round 3 (organizer’s turn): organizer rematches first, sets base word, waits in lobby. Peer presses «Грати ще», lands on pick-word, can replace the word; organizer’s word clears; peer lobby shows only themselves.
- **Cause:** Multi-sim AppState marks organizer `online: false`. `reconcileLobbyPickerState` treated the peer as sole picker and cleared `baseWord` when `chosenBy !== pickerUid`. Peer routed to pick-word; organizer lost chosenBy visibility in rematch lobby.
- **Fix:** Rightful committed chooser sticks (`currentBaseWordPickerUid` + `shouldClearLobbyBaseWordForPicker` force opt-in for `baseWordChosenBy` when deciding clear/steal). Rematch writes only `resultsExitedBy/{actor}` (rules forbid writing peers’ latch leaves).
- **Test:** `tests/online-base-word-picker.test.ts`, `tests/lobby-base-word-picker-reconcile.test.ts`, `tests/post-join-route.test.ts`
- **Area:** `lib/online/base-word-picker.ts`, `lib/firebase/game-session-service.ts`, `app/online/lobby/[gameId].tsx`

### 2026-07 — Rematch lobby waits for non-opted picker (WXAGN seat-hold)

- **Symptom:** First rematcher in round-2 lobby sees «Чекаємо, поки … обере базове слово» with only themselves in the roster; peer still on play finished modal / results and is not opted in.
- **Cause:** Incorrect `shouldHoldRematchPickerSeatForScheduled` kept `currentBaseWordPickerUid` on the scheduled roster member until they opted in, blocking the sole first rematcher from picking/starting.
- **Fix:** Remove seat hold. Picker = rotation among **opted-in** by stable room join order (`baseWordPickerOrder`); sole first rematcher may pick/start; when the rightful later joiner opts in before start, recalculate and hand them the seat (clear word if needed).
- **Test:** `tests/online-base-word-picker.test.ts`, `tests/post-join-route.test.ts`
- **Area:** `lib/online/base-word-picker.ts`, `docs/online-multiplayer-rules.md` §4

### 2026-07 — Results «0 слів» while winner shows N words (QBQ4W / permission_denied)

- **Symptom:** Player still on results sees winner line with word counts but «0 слів з …» empty list. Logs: `subscribeSessionPlayerWords … permission_denied` on `player_words`.
- **Cause:** Rematch cleared / denied live `player_words` (peer reads require `status === finished`; after `waiting` subscribe fails). Results preferred live fetch when viewing round matched finished live, so UI painted empty after bootstrap with missing nodes.
- **Fix:** Always hydrate pinned viewing round from local archive; rematch flips to `waiting` before clearing words; keep spinner until `isSessionWordsSnapshotReady` or frozen archive (`shouldShowOnlineResultsWordsLoading`).
- **Test:** `tests/frozen-round-view.test.ts`, `tests/should-show-online-results-words-loading.test.ts`
- **Area:** `lib/online/session/frozen-round-view.ts`, `lib/online/session/should-show-online-results-words-loading.ts`, `app/online/results/[gameId].tsx`, `lib/firebase/game-session-service.ts`

### 2026-07 — First rematcher claims word while scheduled peer still on results (QBQ4W) — SUPERSEDED

- **Symptom:** Organizer presses «Грати ще» first for round 2+ (peer still on results), opens pick-word / sets base word / Start. Peer was supposed to choose that round's word after opting in.
- **Cause / Fix (wrong):** Seat hold until scheduled peer opted in. **Superseded** by «Rematch lobby waits for non-opted picker» — product rule is first rematcher may pick/start; scheduled peer takes over only after they join the rematch lobby before start.
- **Test:** see superseding entry
- **Area:** `lib/online/base-word-picker.ts`

### 2026-07 — Rematch round-2 pick stuck on organizer after peer joins (QBQ4W)

- **Symptom:** Organizer rematches first and sets base word for round 2. Second player opts in; both see each other, but organizer keeps «слово» / Start instead of rotating pick to the peer.
- **Cause:** A temporary lock kept rematch `currentBaseWordPickerUid` on `baseWordChosenBy` while the word stood, blocking round-2+ rotation when a second opted-in player arrived.
- **Fix:** Remove chosenBy lock; keep latch/chosenBy **eligibility** so brief offline does not drop the first rematcher from the rotation set. With 2+ opted-in, normal rotation applies and clears a word from the non-current picker.
- **Test:** `tests/online-base-word-picker.test.ts` (`rotates rematch round-2 pick…`)
- **Area:** `lib/online/base-word-picker.ts`

### 2026-07 — Rematch lobby hides first rematcher after second «Грати ще» (XM8EW)

- **Symptom:** Player A opts in first, picks base word, waits in lobby. Player B opts in second, may steal pick-word / set another word. B's lobby shows only B; A's lobby shows both.
- **Cause:** (1) Concurrent `finished → waiting` wrote `resultsExitedBy: {actor}` as a whole-node replace, wiping the peer's latch. Focusing B marks A `online: false` → rematch lobby hides A. (2) Picker rotation made scheduled organizer the current picker while A's word stood → `reconcileLobbyPickerState` cleared A's word.
- **Fix:** Rematch latch via leaf `resultsExitedBy/{uid}` writes; refresh latch on presence reconcile / mark online; lock rematch `currentBaseWordPickerUid` to opted-in `baseWordChosenBy` while word stands.
- **Test:** `tests/online-base-word-picker.test.ts`, `tests/rematch-waiting-lobby.test.ts`, `tests/game-session-service.test.ts`
- **Area:** `lib/online/base-word-picker.ts`, `lib/firebase/game-session-service.ts`, `lib/online/presence/reconcile-player-presence.ts`

### 2026-07 — Join code says room closed while host still shows rematch lobby (L8NN5 orphan)

- **Symptom:** Host lobby shows room code + base word + «Почати гру»; peer join with the same code gets «Кімнату не знайдено або приєднання закрито».
- **Cause:** RTDB root is an **orphan shell** (`status` and `organizerId` missing) while leftover `baseWord` / `players` / `settings` remain. Join treated unknown status as `ROOM_NOT_JOINABLE`. Host kept a zombie lobby because focus/AppState heal ignored failed/null reads and did not clear local session.
- **Fix:** Join maps orphan shells to `ROOM_NOT_FOUND`; lobby heal via `tryReadGameSessionSnapshot` clears session when the root is missing/orphan.
- **Test:** `tests/game-session-service-extended.test.ts`, `tests/orphan-game-session.test.ts`
- **Area:** `lib/firebase/game-session-service.ts`, `app/online/lobby/[gameId].tsx`, `lib/online/orphan-game-session.ts`

### 2026-07 — Second «Грати ще» opens pick-word and hides first rematcher (L8NN5)

- **Symptom:** Organizer (scheduled picker, odd rematch round) chooses a base word in lobby. Second player taps «Грати ще» and lands on pick-word, can set a different word, and does not see the organizer in «Гравці». Also seen: both clients show different base words / roster counts for the same room code.
- **Cause:** Focusing the second simulator marks the first `online: false` (AppState `inactive`). Sole online joiner becomes `currentBaseWordPickerUid`; `reconcileLobbyPickerState` clears the first player's `baseWord`; `resolvePostJoinRoute` sends the joiner to pick-word. Lobby hides offline non-opt-in. ChosenBy-only guard is insufficient when the first rematcher is still offline **before** a word is committed (or when a client holds a stale local lobby fork).
- **Fix:** Keep rematch opt-in in `resultsExitedBy` as a durable latch through waiting (cleared at round start); eligibility/visibility use latch + chosenBy; lobby re-reads RTDB on focus and AppState `active`.
- **Test:** `tests/online-base-word-picker.test.ts`, `tests/rematch-waiting-lobby.test.ts`, `tests/bootstrap-rematch-waiting.test.ts`, `tests/online-invariants.test.ts`
- **Area:** `lib/online/rematch/rematch-waiting-lobby.ts`, `lib/online/base-word-picker.ts`, `lib/firebase/game-session-service.ts`, `app/online/lobby/[gameId].tsx`

### 2026-07 — Standings sheet covers GameTimeUp at 00:00

- **Symptom:** At timer 00:00 one player still saw the «Рейтинг» bottom sheet (or play UI under it) while the peer already had «Гру завершено!» / view results.
- **Cause:** Round-end effect closed `showStandings` only after paint. For one (or more) frames both RN Modals were eligible; standings stayed on top of `GameTimeUpModal`.
- **Fix:** Declarative `shouldShowPlayStandingsSheet` requires `!roundEnded` in the same render as time-up; also dismiss stats explain on round end.
- **Test:** `tests/play-menu-gates.test.ts`
- **Area:** `lib/online/play-menu-gates.ts`, `app/online/play/[gameId].tsx`

### 2026-07 — After accept, next word cannot reuse letters (П stuck gray after ПІ → ТО)

- **Symptom:** Player types toward «ПІТ»; debounce accepts «ПІ». They continue with leftover «Т» toward «ТОП», but «П» stays gray/disabled on the keyboard while draft shows «ТО».
- **Cause:** `submitDraft` cleared `draft` / `draftKeyIndices` state but not `draftKeyIndicesRef`. The next `pressKey` appends onto the stale ref, so accepted-letter indices remain “used”.
- **Fix:** Sync-clear the ref on accept (and on remote-submit rollback restore) via `syncDraftKeyIndicesRef`.
- **Test:** `tests/sync-draft-key-indices-ref.test.ts`
- **Area:** `app/online/play/[gameId].tsx`, `app/online/solo/[gameId].tsx`, `lib/game/sync-draft-key-indices-ref.ts`

### 2026-07 — Stale local timer → results while peer still playing (+20 min / pause)

- **Symptom:** After background freeze / missed RTDB updates, one client kept an old `timerEndsAt`. Peer (solo while other offline) added 20 minutes and/or paused. Frozen client hit 00:00, opened results, and could not rejoin the live round (QR → results; «Грати ще» → rematch lobby alone). Not organizer-specific.
- **Cause:** `finishGameSessionIfExpired` correctly refused (remote clock still running / paused), then `beginExpireFinishAttempt` counted failures and called `forceLocalRoundOver` based on the **stale local** endsAt.
- **Fix:** After a failed expire finish, `resyncIfRemoteClockAlive` re-reads RTDB; if pause is active or `timerEndsAt` is still in the future, merge session and skip local round-over.
- **Test:** `tests/play-remote-timer-alive.test.ts`
- **Area:** `lib/online/play-expire-finish.ts`, `lib/online/play-remote-timer-alive.ts`, `app/online/play/[gameId].tsx`

### 2026-07 — Pause vote invisible on peer + cancel stuck (proposer)

- **Symptom:** Proposer sees pause proposal + «очікує відповіді»; peer still on normal play with no vote UI. Proposer «Скасувати запит» appears dead.
- **Cause:** (1) Pause/add-time/early-finish vote UI used RN `Modal` — after background / multi-sim focus, Modal can paint without reliable presses and peers can miss updates the same way as resume. (2) Vote txs use `applyLocally: false`, so cancel only clears UI via listener; disconnect / stale listener leaves ghost proposer UI. (3) Concurrent Metro HMR presence crashes (`beginPresenceWrite`) worsened reconnect.
- **Fix:** In-tree absolute vote overlay (no RN Modal); optimistic local vote clear on cancel + `tryReadGameSessionSnapshot` after vote ops; harden `presenceWriteQueue` methods.
- **Test:** `tests/clear-local-session-vote.test.ts`, `tests/presence-write-queue.test.ts`
- **Area:** `components/VoteParticipantCard.tsx`, `app/online/play/[gameId].tsx`, `lib/online/voting/clear-local-session-vote.ts`, `lib/online/presence/presence-write-queue.ts`

### 2026-07 — Resume vote ghost UI + crash after background / disconnect

- **Symptom:** After backgrounding (and sometimes AP/network change), proposer shows live resume vote + countdown while the peer still sees only «Готове продовжувати». Logs: `TypeError: undefined is not a function` at `latestPresenceIntent` / `shouldMarkPresenceOnline` from `repairPresenceIntentIfNeeded`, plus `FIREBASE WARNING: transaction … failed: disconnect`.
- **Cause:** (1) Metro HMR left a stale binding so `latestPresenceIntent` was `undefined` while `markPlayerOffline` already called repair — uncaught promise. (2) Vote `runTransaction` with default `applyLocally: true` can echo `resumeVote` on the proposer even when the commit aborts on socket disconnect; peers never get the vote.
- **Fix:** Call presence queue via stable `presenceWriteQueue` object + typeof guard; catch repair failures in `markPlayerOffline`; session vote transactions use `{ applyLocally: false }`.
- **Test:** `tests/presence-write-queue.test.ts`
- **Area:** `lib/online/presence/presence-write-queue.ts`, `lib/firebase/game-session-service.ts`, `lib/firebase/rtdb-transaction.ts`, `lib/firebase/session-votes-service.ts`

### 2026-07 — Self «не в грі» after unlock while peer sees «в грі»

- **Symptom:** Right player locks the screen during pause, unlocks, and still sees themselves as «не в грі» on the pause standings; left peer correctly shows them «в грі».
- **Cause:** Unlock races: (1) AppState `active` `tryReadGameSessionSnapshot` could merge a pre-online snapshot, and/or local session missed the online echo; (2) `markPlayerOffline` wrote `online: false` then checked the presence queue — a late offline update could clobber a newer online write without repair.
- **Fix:** Await `markPlayerOnline` before session re-read on `active`; after a superseded presence write, `repairPresenceIntentIfNeeded` re-applies the winning intent.
- **Test:** `tests/presence-write-queue.test.ts`
- **Area:** `hooks/usePlaySessionSubscriptions.ts`, `lib/firebase/game-session-service.ts`, `lib/online/presence/presence-write-queue.ts`

### 2026-07 — Presence toasts stuck for minutes («в грі» + «не в грі»)

- **Symptom:** After pause/resume (often with two simulators), peers saw stacked «знову в грі» / «не в грі» that stayed for minutes; duplicates of the same message also stuck.
- **Cause:** (1) AppState `inactive` freezes JS `setTimeout`, so toast dismiss never ran while the other simulator was focused. (2) ToastBubble stack-shift effect forced `opacity → 1` even while `fading`, undoing fade. (3) Lock/focus presence flip-flops enqueued both offline and returned with no coalesce.
- **Fix:** Wall-clock `expiresAt` + prune on interval / AppState `active`; do not revive opacity while fading; debounce presence offline↔returned (`PRESENCE_TOAST_DEBOUNCE_MS`) and cancel opposite flips.
- **Test:** `tests/presence-toast-coalesce.test.ts`
- **Area:** `hooks/useToastQueue.ts`, `hooks/usePlaySessionToasts.ts`, `components/PlaySessionToast.tsx`, `lib/online/presence-toast-coalesce.ts`, `lib/online/play-toast-wall-clock.ts`

### 2026-07 — Peer on pause misses resume vote UI («Готове продовжувати» while proposer waits)

- **Symptom:** Proposer sees resume vote + countdown + «очікує відповіді»; the required peer still sees only «Готове продовжувати» with no Так/Ні (common with two simulators).
- **Cause:** `PauseRoundModal` used RN `Modal` (separate window). `resumeVote` can land in React state while the already-open Modal portal does not repaint; AppState `inactive` on the unfocused simulator worsens missed listener timing.
- **Fix:** Render pause as an in-tree absolute overlay (play/solo are `headerShown: false`); prefer `session.resumeVote` in the overlay; one-shot `tryReadGameSessionSnapshot` merge on AppState `active`.
- **Test:** `tests/pause-overlay-resume-vote.test.ts`, `tests/play-session-bootstrap.test.ts`
- **Area:** `components/PauseRoundModal.tsx`, `hooks/usePlaySessionSubscriptions.ts`, `lib/firebase/game-session-service.ts`, `lib/online/voting/pause-overlay-resume-vote.ts`

### 2026-07 — Organizer hung on spinner 20–30s after round 2 finish

- **Symptom:** After round 2 ended, organizer saw a blank results spinner for ~20–30s while the peer already had results.
- **Cause:** Local round-over (after failed `finishGameSessionIfExpired`) still allowed `navigateToResults` while RTDB status was `playing`. Results requires `status === 'finished'` + words bootstrap — spinner until finish eventually committed. Also `useLiveRosterPlayerWords` could thrash on unstable roster array identity and never mark bootstrap complete on fetch errors.
- **Fix:** Keep retrying RTDB finish after local round-over; pin ended `baseWordRound` (+ local finished snapshot) on `forceLocalRoundOver` so rematch cannot rewrite `expectedBaseWordRound` / finish N+1; hold play round-key / skip expire ticks while time-up pending past rematch (natural `finished` pin or forced local — gated on `roundOverPendingResults` + pin, not only `localRoundOverForced`); archive before `replace` (live RTDB finished write, else seed/check local archive for `already_finished` and `rematch_advanced`); empty/disabled roster marks words bootstrap complete; add-time vote clears local time-up UI + aborts in-flight results nav / stale modal error; expire clears draft only when not deferring; `navigateToResults` catch → modal error; shared `beginExpireFinishAttempt`.
- **Note (intentional residual):** Passive `fromJoin=1` results while live `playing` still skip prior-archive hydrate (empty until round ends). `rematch_advanced` / missing local archive shows `errorOpenResultsFailed` + retry instead of empty results. Seeded rematch archive may have empty peer word lists (viewer words only; no RTDB fetch after rematch). Before `forceLocalRoundOver` pins the round (~2s of failed finish ticks), a rematch to N+1 can still pass through the round-change effect — rare online (usually see `finished` first), more relevant offline→reconnect.
- **Test:** `tests/play-round-reset-and-timer-gate.test.ts`, `tests/ensure-session-finished-for-results.test.ts`, `tests/play-local-time-up.test.ts`, `tests/ensure-rematch-advanced-results-archive.test.ts`
- **Area:** `app/online/play/[gameId].tsx`, `lib/online/ensure-session-finished-for-results.ts`, `lib/online/ensure-rematch-advanced-results-archive.ts`, `lib/online/play-local-time-up.ts`, `lib/online/play-timer-submit-gate.ts`, `lib/online/play-expire-finish.ts`, `hooks/useLiveRosterPlayerWords.ts`

### 2026-07 — QR rejoin during live round → prior results + all words

- **Symptom:** After leaving home and rejoining an active multiplayer round via QR, the app opened results with the previous round’s full playable lexicon while peers were still playing.
- **Cause:** `rejoinExistingPlayer` wrote player `online` and `liveRoundPlayerUids` in two updates (partial failure → inactive for `resolvePostJoinRoute`). Bare `/results` then ran `shouldRecoverFinishedRoundFromArchive` while live `playing`, hydrating the prior finished archive.
- **Fix:** Atomic session update for rejoin (player + live roster); route live participants (`isLiveParticipant`) to play; pass `fromJoin=1` on playing→results and skip prior-archive recovery; one rejoin retry if still inactive after join.
- **Note (intentional residual):** True passive joiners (`fromJoin=1`, not in live roster) still land on results without prior-archive hydrate while live `playing` — UI may look empty/odd until the round finishes. Wrong prior lexicon is avoided on purpose.
- **Test:** `tests/post-join-route.test.ts`, `tests/frozen-round-view.test.ts`, `tests/game-session-service-extended.test.ts`
- **Area:** `lib/firebase/game-session-service.ts`, `lib/online/post-join-route.ts`, `lib/online/session/frozen-round-view.ts`, `hooks/useFrozenRoundRecovery.ts`, `app/online/results/[gameId].tsx`

### 2026-07 — Old word list + new keyboard after rematch / resume

- **Symptom:** From round 2+, the found-word list could stay from the previous round while the letter keyboard already showed the new base word (often after screen-off / pause / rejoin).
- **Cause:** On `baseWordRound` change the play screen reset nav flags only — not `myWords` / `optimisticWords` / lexicon restore. Split UI sources (keyboard ← `displaySession.baseWord`, list ← local words).
- **Fix:** Hard-clear local play word state when `baseWordRound` changes; reject lexicon cache restore when cached `baseWord` mismatches live session; foreground presence reconcile when AppState becomes `active`.
- **Test:** `tests/play-round-reset-and-timer-gate.test.ts`
- **Area:** `app/online/play/[gameId].tsx`, `lib/online/play-round-local-reset.ts`, `lib/online/session/cache-active-round.ts`, `hooks/useLiveRoundPlayScreen.ts`

### 2026-07 — Online play stuck at 00:00 still validating draft

- **Symptom:** Timer showed `00:00` on online play with no time-up modal; toast «Ви вже вводили це слово» still appeared for leftover draft.
- **Cause:** Online finish relies on `finishGameSessionIfExpired` (no local `onTimeUp`). If finish did not commit, `status` stayed `playing` so `roundEnded` stayed false. `pressKey` gated on `remainingMs<=0` but `submitDraft` did not.
- **Fix:** Gate submit on timer elapsed / round-ended; clear draft at expire; after consecutive failed finish attempts past `timerEndsAt`, force local `roundOverPendingResults` (time-up path); shared `beginExpireFinishAttempt` for interval + AppState `active`.
- **Test:** `tests/play-round-reset-and-timer-gate.test.ts`
- **Area:** `app/online/play/[gameId].tsx`, `lib/online/play-timer-submit-gate.ts`, `lib/online/play-expire-finish.ts`

### 2026-07 — Store builds 1.4.x App Check 100% Invalid

- **Symptom:** After first GitHub Actions → Play/TestFlight releases (v1.4.0–1.4.1), App Check Console showed **100% Unverified: invalid** for RTDB and Auth (enforcement still off).
- **Cause:** (1) `useProductionAppCheckProviders()` relied on raw `APP_VARIANT` / `EAS_BUILD_PROFILE`, which Metro does **not** inline into the client JS bundle — store builds fell back to the **debug** provider without a registered debug token. (2) JS Firebase `initializeApp` used a **web** `EXPO_PUBLIC_FIREBASE_APP_ID` while native RNFB attested as Android/iOS apps — App Check tokens are app-scoped → Invalid.
- **Fix:** Set `EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION=true` on the EAS `production` profile; bake `firebaseAppCheckProduction` from that flag only (plugin does **not** use `APP_VARIANT`); require platform app ids with **no** web fallback; runtime mode uses **only** `EXPO_PUBLIC_*` + `expo.extra`; never attach `debugToken` when production providers are on.
- **Test:** `tests/app-check-mode.test.ts`, `tests/app-ids.test.ts`; manual: new store build → App Check metrics show **Verified** (not Invalid). Do **not** Enforce until Verified dominates.
- **Area:** `lib/firebase/app-check-mode.ts`, `lib/firebase/app-ids.ts`, `lib/firebase/config.ts`, `lib/firebase/native-app-check-native.ts`, `plugins/with-firebase-extra.cjs`, `eas.json`

### 2026-07 — Training resume hit Firebase Auth / App Check Invalid

- **Symptom:** App Check Console showed Auth/RTDB **Unverified: invalid** while finishing a paused local training round on a production Android build (Play Integrity). Training is supposed to stay offline.
- **Cause:** `abandonOrganizerWaitingRoomForDraft` always called `ensureAnonymousAuth` (App Check + anonymous sign-in) before checking whether any tracked/published waiting room existed. Pure solo mount/resume therefore still contacted Auth. Separately, the JS App Check `CustomProvider` could return an empty native token with a fake expiry, which Firebase logs as **Invalid** rather than Missing.
- **Fix:** Collect waiting-room ids first and skip Auth/RTDB when none; throw `APP_CHECK_TOKEN_EMPTY` instead of attaching an empty token; reset sticky App Check init on bootstrap `forceRetry`; await App Check before presence `.info/connected` and public lobby browse reads.
- **Test:** `tests/abandon-tracked-waiting-room.test.ts` (negative/positive contracts), `tests/app-check-resolve-token.test.ts`, `tests/public-lobby-service.test.ts` (App Check before get), `tests/game-session-service-extended.test.ts` (presence after App Check). Manual production smoke: clean training pause/resume/finish should not create Auth spikes; invite/publish and browse still work.
- **Area:** `lib/online/abandon-tracked-waiting-room.ts`, `lib/firebase/app-check.ts`, `lib/firebase/bootstrap.ts`, `lib/firebase/public-lobby-service.ts`, `lib/firebase/game-session-service.ts`

### 2026-07 — iOS base-word suggestion needs two taps

- **Symptom:** On iOS, tapping a suggest item appeared to select but the field stayed on the typed prefix (e.g. «СУПЕРКОН»); second tap worked. Android was fine.
- **Cause:** The first tap _did_ call `onSelect`, but iOS then emitted a stale `TextInput` `onChangeText` with the pre-select value while blurring/dismissing the keyboard, which overwrote React state. Earlier Pressable/`keyboardShouldPersistTaps` theories were incomplete.
- **Fix:** `useBaseWordSuggestField` ignores `onChangeText` for `BASE_WORD_SUGGEST_IGNORE_CHANGE_MS` after suggest/shuffle; `onTouchSelectStart` on `onPressIn` + deferred `onTouchSelectEnd` on `onPressOut` (RN order is pressOut→press; sync clear would let blur start hide) + TTL; commit on `onPress`; on blur set `immediate` immediately (also when suppress swallows hide) and only defer dropdown hide; typing uses hint status `pending` (spacer) not `empty`/«Обери базове слово»; typing soft-pauses prefetch without cache eviction; `onFocus` clears suppress, ignore window, and pending hide timer.
- **Test:** `tests/use-base-word-suggest-field.test.tsx` (incl. pressOut→blur→press), `tests/use-setup-playable-lexicon-hint.test.tsx` (`pending` + cache survives typing), `tests/playable-words-count-hint.test.tsx`; manual iOS one-tap select.
- **Area:** `hooks/useBaseWordSuggestField.ts`, `components/BaseWordSuggestDropdown.tsx`, setup/pick-word screens

### 2026-07 — Setup lexicon build very slow on Android (localeCompare)

- **Symptom:** Long base + proper/slang (~5773 accepts) took ~90–180s on Android setup; felt much worse than lobby/play.
- **Cause:** `DictionaryIndex` membership used binary search with per-probe `localeCompare('uk')`, and lexicon sort used per-call `localeCompare` — dominant cost scaled with accepted count on Hermes. Setup also often ran multiple builds while changing words.
- **Fix:** O(1) `Set` in `DictionaryIndex`; `Intl.Collator('uk')` for lexicon sort; commit-only setup prefetch (select/shuffle/blur); typing soft-pauses without cache eviction. Verified S931B Dev Client: ~5s for 5773 accepts (was ~187s).
- **Test:** `tests/round-playable-lexicon.test.ts`, `tests/round-playable-lexicon-prefetch.test.ts` (`pause` vs `clear`), `tests/use-setup-playable-lexicon-hint.test.tsx`, `tests/dictionary.test.ts`; manual `[lexicon] filterMs/finalizeMs` logs
- **Area:** `lib/dictionary/dictionary-index.ts`, `lib/dictionary/round-playable-lexicon.ts`, `lib/dictionary/round-playable-lexicon-prefetch.ts`, `hooks/useSetupPlayableLexiconHint.ts`

### 2026-07 — Blank screen when opening menu during resume vote

- **Symptom:** On pause, after a peer proposed «продовжити», pressing the hamburger menu showed a blank white screen (neither pause nor menu).
- **Cause:** `showGameMenu` hid `PauseRoundModal` via `pauseUiObscured`, while `gameMenuBlockedByVote` also prevented `GameMenuModal` from rendering when `resumeVote` was active.
- **Fix:** Gate pause obscuring on menu actually being allowed; hide hamburger / no-op open while votes block the menu (`isGameMenuBlockedByVote` / `isPauseUiObscuredByOverlays`).
- **Test:** `tests/play-menu-gates.test.ts`
- **Area:** `lib/online/play-menu-gates.ts`, `app/online/play/[gameId].tsx`, `components/PauseRoundModal.tsx`

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

### 2026-07 — Pause/resume vote waits on peer with locked screen (`inactive`)

- **Symptom:** Peer locks the phone (iOS lock screen); proposer still sees them as «в грі» / «очікує відповіді» on pause or resume votes.
- **Cause:** `shouldMarkPresenceOffline` only treated AppState `background`. On iOS lock the app often stays `inactive` without reaching `background`, while the RTDB socket stays alive so `onDisconnect` does not fire.
- **Fix:** Mark presence offline on `inactive` as well as `background`; online / rejoin only on `active`. Training auto-pause remains `background`-only.
- **Test:** `tests/app-presence-state.test.ts`
- **Area:** `lib/online/presence/app-presence-state.ts`, `docs/online-multiplayer-rules.md` §7

### 2026-07 — Pause vote waits on player who backgrounded the app

- **Symptom:** After one player sent the app to the home screen or locked the phone (without force-killing), peers still saw them as «в грі» and pause / other votes waited for their response.
- **Cause:** `usePlayerOnlinePresence` only re-marked `online` on AppState `active`; background did not call `markPlayerOffline`. While the RTDB socket stayed alive, `onDisconnect` did not fire. Open `pauseVote` also had no reconcile when the required set became empty. (Later: lock screen often only emits `inactive` — see 2026-07 inactive entry.)
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

### 2026-07 — Rematch starter stuck in solo UI after mid-round joins

- **Symptom:** Player who started a rematch round alone (then peers joined mid-round via invite) kept solo play UI: no rank/points chip peers, no overlap avatars, no standings «Рейтинг», votes applied without consensus. Joiners still saw multipplayer UI. RTDB could keep `settings.uniqueBonusEnabled: false` despite 3 live players; logs showed `syncSessionPlayerScores [Error: maxretry]`.
- **Cause:** Mid-round join metadata update bundled a full `players` object rewrite (score recompute on x2 latch) with `liveRoundPlayerUids` + settings latch. Writing peers' `online`/`hasLeft` fails RTDB rules → whole atomic `update` aborted (often swallowed as permission-denied «ok»). Starter’s `liveRoundPlayerUids` stayed solo → `hasMultiplayerRound` / vote eligibility ignored joiners. Score sync used a whole-`players` transaction that lost to presence/score races (`maxretry`).
- **Fix:** Join/sync write only `players/{uid}/score|wordCount` leaves; keep `liveRoundPlayerUids` + x2 latch in the same successful update. `hasMultiplayerRound` also treats online roster peers as multipplayer when live-uid list lags.
- **Test:** `tests/join-mid-round-live-roster.test.ts`, `tests/live-round-membership.test.ts`, `tests/scoring.test.ts`
- **Area:** `lib/firebase/game-session-service.ts`, `lib/game/scoring.ts`, `lib/online/presence/live-round-membership.ts`

### 2026-07 — Online freeze after last-second add-time propose fails

- **Symptom:** Player submits «Додати час» on the final second; picker closes, no vote reaches peers. Others see «Гру завершено», proposer stays on interactive-looking play UI at `00:00` with no taps responding (force-quit needed).
- **Cause:** (1) `AddTimeModal` closed before `proposeAddTime` settled, ending local finish defer while the write could still no-op (`requirePlaying` after peers already finished). (2) Online lacked solo’s cancel-at-zero finish path and could stack / ghost `GameTimeUpModal` under the picker (`timeUpModalVisible === roundEnded` while `showAddTimeModal` still true).
- **Fix:** Await propose before close; `proposeAddTime` returns committed; on failed propose / cancel with expired timer use `resolveAddTimePickerDismissAction` → local `roundOverPendingResults` + `finishGameSessionIfExpired`; `shouldShowTimeUpModal` requires picker closed.
- **Test:** `tests/add-time-vote.test.ts`, `tests/session-votes-service.test.ts`
- **Area:** `components/AddTimeModal.tsx`, `app/online/play/[gameId].tsx`, `lib/online/voting/add-time-vote.ts`, `lib/firebase/session-votes-service.ts`

### 2026-07 — Letter fly animation degrades with large accepted-word lists

- **Symptom:** After ~60 accepted words, the ghost letter fly-to-draft animation became nearly invisible on Android (and faster on iOS). Worsened with more words.
- **Cause:** Each draft keystroke re-rendered the word list, ran triple animated FlatList prefix scrolls, and invalidated all visible rows; fly animation competed for UI thread time. `usedKeyIndices` was recreated every render, breaking `LetterKeyboard` memo. `entranceNormalizes` grew without pruning.
- **Fix:** Memoized `DraftLetterFlyOverlay` with animation stop/generation guard; prefix-aware row memo; debounced non-animated prefix scroll; pruned entrance set after row animation; Android FlatList tuning (`removeClippedSubviews`, smaller window).
- **Test:** `tests/word-list-row-memo.test.ts`, `tests/word-list-entrance.test.ts`
- **Area:** `components/online/OnlinePlayComposePanel.tsx`, `components/WordList.tsx`, `hooks/useVirtualWordListProps.ts`

### 2026-07 — Fabric crash unmounting x2 badge after word accept

- **Symptom:** iOS crash `NSInternalInconsistencyException: Attempt to unmount a view which has a different index` right after accepting a unique (x2) word; stack points at `RCTParagraphComponentView` with `x2` text.
- **Cause:** `WordListRow` conditionally mounted/unmounted prefix overlays, word `Text` variants, x2 badge, and overlap avatars. Clearing the draft (prefix flush) at the same time as list insert/entrance shifted native child indices while Fabric tried to unmount the badge.
- **Fix:** Always render fixed child slots in the row (hide unused via opacity/width); keep badge `Animated.Text` mounted.
- **Test:** `tests/word-list-row-slots.test.ts`
- **Area:** `components/WordList.tsx`, `lib/ui/word-list-row-slots.ts`

### 2026-07 — Lexicon rebuild after cold start blocks word validation

- **Symptom:** After restoring a paused solo or online round from AsyncStorage, validation showed «немає в словнику» for 5–20s on Android with large lexicons (3000+ words) while the lexicon rebuilt on the JS thread.
- **Cause:** Durable round snapshots (`solo-round-snapshot`, `active-round-cache`) saved words/timer but not the built `PlayableLexiconSnapshot`; in-memory lexicon cache was lost on process death.
- **Fix:** Persist `playableLexicon` alongside round progress; restore via `useRoundPlayableLexicon({ archiveSnapshot })` on solo/play screens. Re-persist when lexicon becomes ready mid-round.
- **Test:** `tests/solo-round-snapshot.test.ts`, `tests/cache-active-round.test.ts`, `tests/round-playable-lexicon.test.ts`
- **Area:** `lib/game/solo-round-snapshot.ts`, `lib/online/session/cache-active-round.ts`, `store/organizer-solo-store.ts`, `app/online/solo/[gameId].tsx`, `app/online/play/[gameId].tsx`

### 2026-07 — Compose validation never re-ran after lexicon/dictionary ready

- **Symptom:** Training/solo stopped accepting real words (e.g. «СУП») and showed no «немає в словнику» feedback; draft sat unchanged.
- **Cause:** An interim compose-draft hook revalidated only on `draft` changes (missed lexicon readiness). Restored play/solo validate effect depends on `submitDraft` again so readiness updates re-check. Solo must allow lexicon-only validation after `releaseDictionaryAfterBuild`.
- **Fix:** Keep parent debounce deps that include `submitDraft`; solo `acceptWord` uses round lexicon without requiring the full dictionary object in memory.
- **Test:** Manual — type a known word after lexicon finishes loading in training.
- **Area:** `app/online/solo/[gameId].tsx`, `app/online/play/[gameId].tsx`

### 2026-07 — Draft hangs on iOS after input-lag “optimizations” (regression)

- **Symptom:** On iOS (sim + device), mid-word draft paints hung for seconds (e.g. «ЛЕЛЕ» last letter delayed; «АК» after «Р» while a yield toast was up; clear-draft delayed 1–2s). Often correlated with toasts but also happened with no toast. Did not exist on iOS before the uncommitted lag work; Android training 100+ words was the original issue.
- **Cause:** Speculative fixes (`useDeferredValue` / `startTransition`, compose island + contention freeze, live prefix thrash mitigations, pressIn letter apply) fought RN/iOS scheduling and introduced priority inversion / extra keystroke work. Toasts were a coincidence (same JS-thread backlog), not the root.
- **Fix:** Revert online play compose/toast architecture to the pre-experiment path. Keep only: memoized solo `entries`/`displays` (`buildSoloWordListDisplay`) for Android training, and WordList Fabric stable row slots.
- **Test:** `tests/solo-word-list-display.test.ts`, `tests/word-list-row-slots.test.ts`
- **Area:** `app/online/solo/[gameId].tsx`, `lib/game/solo-word-list-display.ts`, `components/WordList.tsx`

### 2026-07 — Draft typing janks with large word lists (training)

- **Symptom:** On Android training, letter taps from the base-word keyboard got progressively slower after ~100 accepted words, even with animations off. An interim `useDeferredValue(draft)` fix made iOS much worse (letters hung 2–3s before appearing in the draft).
- **Cause:** Solo rebuilt `entries`/`displays` on every render (`getScoredWords()` / `words.map`), so FlatList + row work ran on every keystroke as the list grew.
- **Fix:** Memoize solo list props on `words` via `buildSoloWordListDisplay`. Do **not** use `useDeferredValue` for draft on RN/iOS.
- **Test:** `tests/solo-word-list-display.test.ts`
- **Area:** `app/online/solo/[gameId].tsx`, `lib/game/solo-word-list-display.ts`

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

### 2026-07 — Archive rematch bootstrap kept stale `online` (opt-in bypass)

- **Symptom:** After session purge / archive rematch, peers who were `online` in the finished archive appeared in rematch lobby and could enter `liveRoundPlayerUids` without «Грати ще».
- **Cause:** `buildRematchWaitingSession` only zeroed scores and copied archive presence; live `rematchFinishedSessionToWaiting` used `rematchWaitingPlayerPatch`.
- **Fix:** `buildRematchWaitingSession(source, actorUid)` applies the same patch (actor + `resultsExitedBy` → online; others offline, `hasLeft: false`).
- **Test:** `tests/bootstrap-rematch-waiting.test.ts`
- **Area:** `lib/online/rematch/build-rematch-waiting-session.ts`, `bootstrap-rematch-waiting-from-archive.ts`

### 2026-07 — Non-opt-in organizer auto-joined live round from lobby

- **Symptom:** Organizer who never pressed «Грати ще» could be pulled into rematch `playing` via lobby auto-join.
- **Cause:** `missedLiveRosterWhileOptedIn` treated `organizerId === myUid` as opted-in.
- **Fix:** Auto-join only when `isRematchWaitingLobbyOptedIn` (online / `resultsExitedBy`).
- **Test:** `tests/live-round-screen-actions.test.ts`
- **Area:** `lib/online/live-round-screen-actions.ts`

### 2026-07 — Pause vote could hang forever (no 30s timeout)

- **Symptom:** Open pause proposal with a silent online peer never resolved.
- **Cause:** `shouldActivatePauseFromVote` required unanimous yes only; `useVoteExpiryResolver` omitted pause.
- **Fix:** Silence-as-yes after 30s (same as early-finish/resume); expiry interval calls `resolvePauseVoteIfReady`.
- **Test:** `tests/pause-resume-vote.test.ts`
- **Area:** `lib/online/voting/pause-vote.ts`, `hooks/useVoteExpiryResolver.ts`, `lib/firebase/session-votes-service.ts`

### 2026-07 — Rematch lobby ejects opted-in player to prior results when peer becomes picker

- **Symptom:** Organizer (or first «Грати ще») picks a base word and sits in rematch lobby; second player opts in and takes the scheduled picker turn. First player is bounced to the **previous round results** instead of staying in lobby with the word cleared.
- **Cause:** Rematch waiting redirects `!optedIn` viewers to results. Opt-in was only `online` / `resultsExitedBy` / one-shot `optedIn=1` query. After pick-word → lobby without `optedIn`, a brief `online: false` (presence handoff / peer-join race) made `shouldRedirectNonOptInViewer` true. (Later: rematch bootstrap keeps `resultsExitedBy` as a durable waiting latch — see L8NN5 entry.)
- **Fix:** Latch rematch opt-in for the current `baseWordRound` once seen (`rematchOptInLatched`); pick-word → lobby passes `optedIn=1`; reconcile presence instead of eject when latched but briefly offline.
- **Test:** `tests/live-round-screen-actions.test.ts`, `tests/rematch-lobby-opt-in-latch.test.ts`
- **Area:** `hooks/useLiveRoundLobbyScreen.ts`, `lib/online/live-round-screen-actions.ts`, `lib/online/session/rematch-lobby-opt-in-latch.ts`, `app/online/pick-word/[gameId].tsx`

### 2026-07 — Rematch lobby desync after early picker then scheduled picker re-picks

- **Symptom:** Player A taps «Грати ще» first and sets a base word; Player B (scheduled picker) joins second and sets a different word. A still sees only themselves + their old word; B sees both + the new word. After fixing with lobby→pick-word `replace`, B (organizer) was dumped to **home** after saving a word while A stayed in lobby seeing B offline.
- **Cause:** (1) Rematch sole-eligible early opt-in can commit a base word; when the scheduled picker comes online `reconcileLobbyPickerState` clears it and B re-picks — A must receive that RTDB update. (2) Lobby → pick-word `router.replace` removed the lobby screen; `useSyncedStackBack` treated `POP`/`GO_BACK` as leave → `exitOnlineToHome`, and organizer abandon marked them offline. (3) Organizer could still write `baseWord` via `updateGameSessionSetup` while not the current picker.
- **Fix:** Lobby → pick-word **`push`** with `fromLobby=1` (lobby stays mounted + keeps presence); pick-word skips presence when `fromLobby`; return via `router.back()`. Lobby focus re-read of RTDB; `updateGameSessionSetup` requires current picker for base word; lobby «обрало …» uses `baseWordChosenBy`.
- **Test:** `tests/lobby-pick-word-navigation.test.ts`, `tests/game-session-service-extended.test.ts` (organizer non-picker base word rejected)
- **Area:** `app/online/lobby/[gameId].tsx`, `app/online/pick-word/[gameId].tsx`, `lib/online/lobby-pick-word-navigation.ts`, `lib/firebase/game-session-service.ts`

### 2026-07 — Presence handoff between online screens

- **Symptom:** Navigating lobby → play → results in the same room briefly marked the player offline; others saw them leave/rejoin.
- **Cause:** `usePlayerOnlinePresence` always called disconnect cleanup on unmount, even for in-room screen transitions.
- **Fix:** Added `lib/online/presence-handoff.ts`; call `handoffPlayerPresence()` before navigating, and `consumePresenceHandoff()` on unmount to skip offline marking. Lobby → pick-word uses **push + `fromLobby`** (lobby keeps presence; do not `replace` — that fires leave-home).
- **Test:** `tests/presence-handoff.test.ts`, `tests/lobby-pick-word-navigation.test.ts`
- **Area:** `lib/online/presence/presence-handoff.ts`, `lib/online/presence/use-player-online-presence.ts`, `lib/online/lobby-pick-word-navigation.ts`

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
