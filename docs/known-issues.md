# Known issues and regression log

Short record of non-trivial bugs that were fixed. Future agents: **search this file** before changing code in the listed areas.

Format: **Symptom → Cause → Fix → Area**

---

### 2026-08 — Rematch-survival wipe race (C1 wipe race)

- **Symptom:** Authoritative empty snapshot wiped rich `tryFetch` bootstrap on results/left.
- **Cause:** Results roster bootstrap completed on the first authoritative listen (even if empty) before the non-empty bootstrap fetch settled.
- **Fix:** `useLiveRosterPlayerWords` delay bootstrap-complete until fetch settles; apply non-empty fetch over empty seed if previous leaves are 0 (wipe race survival).
- **Test:** `tests/use-live-roster-player-words.test.tsx` (rich fetch over empty listen), `tests/frozen-round-view.test.ts`
- **Area:** `hooks/useLiveRosterPlayerWords.ts`, `lib/online/session/frozen-round-view.ts`

### 2026-09 — RTDB diagnostics ↓ double-count on word-maps seed

- **Symptom:** With diagnostics collecting, ↓ JSON for a room was ~2× the `wordPlayers` tree on join/rematch.
- **Cause:** ADR-022 listen-first attaches `onChild*` before seed `get`; both paths called `instrumentedSnapshotVal` for the same initial tree.
- **Fix:** `instrumentedChildSnapshotVal(seeded, …)` skips child recording until authoritative seed; seed `get` remains the initial ↓ count (ADR-025 trade-off #4).
- **Test:** `tests/firebase/instrumentation.test.ts` (`instrumentedChildSnapshotVal`)
- **Area:** `lib/firebase/session-word-maps-service.ts`, `lib/firebase/rtdb-instrumentation.ts`

### 2026-08 — ADR-022: Maps Listen & Seed Reliability

- **Symptom:** Dead listens after seed, parallel hung gets, and hung-cap Retry spam during slow connectivity.
- **Cause:** (1) `onValue` root listen was too heavy for word-maps SoT. (2) Seed `get` and listeners were not atomic. (3) Soft-timeout started parallel gets, regressing late-seal.
- **Fix:** (1) Listen-first + get∪buffer (coalesce by word key). (2) Single-flight `startSeedGet`. (3) Soft-timeout as hang detector only (wait for late-seal). (4) Remount on `unavailable`.
- **Test:** `tests/firebase/session-word-maps-service.test.ts`, `tests/play-word-maps-apply.test.ts`, `tests/online-invariants.test.ts`
- **Area:** `lib/firebase/session-word-maps-service.ts`, `lib/online/session/play-word-maps-apply.ts`

### 2026-08 — Late-round words missing for peers (sync lag)

- **Symptom:** Submitter had words peers lacked; results disagreed (e.g. СІ / СІНО). Metro: `wordPlayers permission_denied` at finish.
- **Cause:** `submitOnlineWord` used `runTransaction` with local echo. Submitter's maps looked done in ~50ms while server TX retried for seconds; `playing → finished` then denied the leaf.
- **Fix:** Parent/leaf **`set`** (no TX). Expire finish waits `FINISH_WORD_SUBMIT_GRACE_MS` after `timerEndsAt`. Rules allow append for 15s after `finishedAt`. Navigate-to-results drains `syncInFlight`.
- **Test:** `tests/submit-online-word.test.ts`, `tests/firebase/database.rules.test.ts`
- **Area:** `lib/firebase/submit-online-word.ts`, `firebase/database.rules.json`

### 2026-08 — waitForRtdbConnected crashed (sync unsub)

- **Symptom:** Redbox `TypeError: undefined is not a function` at `connection.ts` `unsub()` during sync connection AP switch.
- **Cause:** Firebase `onValue('.info/connected')` can fire synchronously. The callback called `unsub()` before the variable was assigned (TDZ).
- **Fix:** Safe `unsub?.()` and repeat check after `onValue` returns.
- **Test:** `tests/firebase-bootstrap-chain.test.ts`
- **Area:** `lib/firebase/connection.ts`

### 2026-08 — Hung ensureAnonymousAuth never reached maps CTA

- **Symptom:** `subscribeSessionWordMaps` awaited auth with no timeout → hung Auth left results on "Завантаження слів" forever.
- **Fix:** `WORD_MAPS_AUTH_TIMEOUT_MS` (15s) → emit `unavailable` without attach; Retry CTA can then show.
- **Test:** `tests/firebase/session-word-maps-service.test.ts`
- **Area:** `lib/firebase/session-word-maps-service.ts`

### 2026-08 — Rematch-survival close ignoring mapsUnavailable (C2)

- **Symptom:** `shouldCloseResultsRematchSurvival` could close after grace while `mapsUnavailable` (if bootstrap-complete was stale-true), hiding the Retry CTA.
- **Fix:** Close requires `mapsUnavailable !== true`. Keep survival open for Retry/late rich.
- **Test:** `tests/online-invariants.test.ts` (§ADR-022)
- **Area:** `lib/online/session/frozen-round-view.ts`

### 2026-08 — Diagnostics blocked app bootstrap

- **Symptom:** App could get stuck on splash screen if diagnostics hydration was slow.
- **Cause:** `hydrateRtdbDiagnostics()` was part of the blocking bootstrap sequence in `RootLayout`.
- **Fix:** Moved diagnostics hydration out of the blocking sequence.
- **Area:** `app/_layout.tsx`

### 2026-08 — Firebase Auth App Check token: TypeError

- **Symptom:** Metro logs show `TypeError: undefined is not a function` on every Auth request.
- **Cause:** Modular App Check API incorrectly used in React Native (missing `await`, instance method instead of standalone).
- **Fix:** `await initializeNativeAppCheck()` and use `getToken(instance)`.
- **Area:** `lib/firebase/native-app-check-native.ts`

### 2026-08 — App Check token expiry parsing failed

- **Symptom:** `atob` errors in Hermes due to URL-safe base64 or missing padding.
- **Fix:** Robust base64-url decoder with padding support.
- **Area:** `lib/firebase/app-check-token-expiry.ts`

### 2026-08 — Rematch heal REMATCH_FAILED during finish grace

- **Symptom:** `join_live` failed with `REMATCH_FAILED` while session still `playing` during grace.
- **Fix:** `join_live` polls via `ensureSessionFinishedForResults` before rematch.
- **Area:** `lib/online/rematch/restart-rematch-online-round.ts`

### 2026-08 — View results failed during finish grace

- **Symptom:** «Не вдалося відкрити результати» during grace.
- **Cause:** Skipping archive during grace treated as `rematch_advanced` error.
- **Fix:** Await `ensureSessionFinishedForResults` instead of jumping to `rematch_advanced`.
- **Area:** `lib/online/ensure-session-finished-for-results.ts`

### 2026-08 — x2Claim / score derivation migration (TOCTOU)

- **Symptom:** High RTDB traffic and TOCTOU races in peer score updates.
- **Cause:** Legacy `x2Claim` and absolute score writes.
- **Fix:** Standings derived on clients from `wordPlayers` shards; removed score writes.
- **Area:** `lib/firebase/submit-online-word.ts`, `lib/online/session/archive-words-gate.ts`

### 2026-08 — submit shard rollback

- **Symptom:** Potential for orphaned optimistic words if RTDB commit fails.
- **Fix:** Manual rollback of committed shard on outer catch.
- **Area:** `lib/firebase/submit-online-word.ts`

### 2026-08 — archive sync reliability (ADR-023)

- **Symptom:** Local archives missing words or failing to sync after round finish.
- **Fix:** Robust retry logic and `archiveDiscoveryPending` latch.
- **Area:** `lib/online/coordinated-session-cleanup.ts`

### 2026-07 — Online RTDB score path removed

- **Symptom:** Desync between `players.score` and word lists; complex TX rollbacks.
- **Fix:** Standings derived on clients from `wordPlayers` map only. `players.score` kept for legacy but ignored by v4+ clients.
- **Area:** `lib/firebase/submit-online-word.ts`, `lib/online/session/archive-words-gate.ts`, `firebase/database.rules.json`

### 2026-07 — Rematch PD / False-join forks

- **Symptom:** Dual «Грати ще» PD'd on peer presence, leading to room forks.
- **Fix:** Atomic `finished → waiting` status CAS; leaf-path presence updates only.
- **Area:** `lib/firebase/game-session-service.ts`, `lib/online/rematch/restart-rematch-online-round.ts`

### 2026-07 — Presence handoff between screens

- **Symptom:** Brief offline flash during lobby → play → results navigation.
- **Fix:** `handoffPlayerPresence()` + `consumePresenceHandoff()` to skip cleanup on unmount.
- **Area:** `lib/online/presence/presence-handoff.ts`, `lib/online/presence/use-player-online-presence.ts`

### 2026-07 — iOS base-word suggestion two-tap bug

- **Symptom:** Keyboard blur overwrote selected suggestion on first tap.
- **Fix:** `onChangeText` suppression window + deferred blur hide.
- **Area:** `hooks/useBaseWordSuggestField.ts`

### 2026-07 — Home from results resurrects rematch joiner (NLD7S)

- **Symptom:** Joiner who left to Home from results was resurrected in the rematch lobby.
- **Cause:** `exitOnlineToHome` race with `rejoinExistingPlayer` and rematch latch.
- **Fix:** `rejoinExistingPlayer` must not clear `hasLeft` without `reviveAfterLeave`.
- **Area:** `lib/online/presence/rejoin-existing-player.ts`, `lib/online/exit-online-flow.ts`

### 2026-07 — Finish PD leaves playing stuck; rematch REMATCH_FAILED (LRAHP)

- **Symptom:** Round stuck in `playing` status after time up; rematch fails with `REMATCH_FAILED`.
- **Cause:** `permission_denied` on whole-session finish write (rules violation).
- **Fix:** Use leaf-path finish; unchanged peer online validate; rematch heal.
- **Area:** `lib/firebase/game-session-service.ts`, `firebase/database.rules.json`

### 2026-07 — Multi-round eject

- **Symptom:** Players ejected from room during multi-round play.
- **Cause:** Cross-module race between sync-coordinator, presence, and rematch.
- **Fix:** Synchronized opt-in and presence cleanup.
- **Area:** `lib/online/sync-coordinator.ts`

### 2026-06 — Frozen round results overwritten when rematch advances

- **Symptom:** Results for a finished round were lost when a peer started a rematch.
- **Cause:** Live session data overwriting the "frozen" view of non-opt-in players.
- **Fix:** ADR-022; keep frozen snapshot until explicit opt-in.
- **Area:** `lib/online/session/frozen-round-view.ts`

### 2026-06 — Organizer waiting room deleted on app background

- **Symptom:** Public lobby disappeared when organizer backgrounded the app.
- **Cause:** `abandon-gate` incorrectly triggered by AppState changes.
- **Fix:** Abandon waiting room only on explicit back navigation.
- **Area:** `lib/online/use-organizer-abandon-on-exit.ts`
