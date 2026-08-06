# Agent session notes (rolling)

Short-lived observations from AI agent sessions — flaky tests, emulator quirks, temporary workarounds. **Not** the source of truth.

Promote important items to permanent docs (`known-issues.md`, `online-multiplayer-rules.md`, `decisions.md`) and delete stale notes here.

---

<!-- Add dated notes at the top -->

### 2026-08-05 — iOS bleAllowed only after real BLE use

- iOS ensure: BLE left `unknown` + `os-pending`; confirm via `setNearbyBleCapabilityAllowed(true)` after successful BLE host advertise / startScan (not failed scan).
- Sync: `allowBleProbe` independent of `allowOsPermissionPrompt`; coalesce ANDs probe and a live `bleProbeLiveAllowed` / `isBlePhaseStillAllowed` re-check before the hybrid BLE phase; OS ensure uses `includeBle: allowBleProbe && bleProbeLiveAllowed` (LAN-only when play suppresses); `bleTimeoutMs` only if confirmed \|\| live probe.
- playQr reconcile: `requestNearbyOsPermissions({ includeBle: false })` — no munim/BT mid-round; ensure object-only contract.
- Completion cooldown arms only after `trustedWireCompleted` (TCP/BLE archivesEnd → non-empty HaveAck), not UDP Hello or partial archives without End.
- Play effect restart key omits online roster fingerprint (presence flap).

### 2026-08-05 — Nearby host applyToken + BLE migrate opt-in

- `applyToken` on startHost handlers; transports commit only while active (no stale clobber).
- Missing BLE capability key stays `unknown` (probe-eligible; play still skips until `allowed`); LAN still migrates from granted.
- maybeSync coalesce ORs `allowOsPermissionPrompt` so play(false) cannot drop join(true).

### 2026-08-05 — Nearby join→lobby await drain (C1/C2 hooks)

- maybeSync waiters resolve only after drain idle (sync-then-host); play QR host sequenced after sync.
- BLE: soft startHost (no listener teardown on reconcile); queue Want while serve busy; persist lanAllowed gate.

### 2026-08-05 — Nearby review C1/C2 (global sync flight + deferred BLE Hello)

- Global single-flight for maybeSync (cross-key rematch-safe); deferred Hello after serve release.
- BLE capability missing key → `unknown` (probe-eligible); peer archive requires session round/baseWord match.

### 2026-08-05 — LAN→BLE review fixes (B1/B2)

- B1: LAN vs BLE permission gates split; BT deny must not set global nearby denied.
- B2: BLE TX serial queue + single-flight Want; client ignores shared notify until own Want.
- Lobby sync-then-host; location in Android manifest for API<31 BLE.

### 2026-08-05 — LAN→BLE GATT hybrid (munim-bluetooth)

- Hybrid: LAN first, BLE GATT fallback (`munim-bluetooth` + nitro). Host starts both.
- Chunked ATT framing in `ble-gatt-framing.ts`; HaveAck `ble` trusted like TCP.
- **Native rebuild required** after pull. Manual smoke: Wi‑Fi LAN + cellular/isolation BLE.

### 2026-08-05 — UDP discovery bind (still required)

- **Bug:** client scan `bind(0)` ≠ host announce port → silent no discovery on device.
- **Fix:** `udp-discovery.ts` — announce destination === listen port; `reusePort: true`.
- Manual smoke: 2 phones, same Wi‑Fi/hotspot, mid-round join with gaps (LAN path).

### 2026-08-05 — Nearby review C1/C2 (in-flight queue + TCP per-archive frames)

- Same-key `maybeSync` queues latest input and reruns (join→play race).
- LAN: one archive / TCP line + `archivesEnd`; `MAX_TCP_LINE_CHARS` stays ~1× archive (not N×).
- Play without QR = no advertise (documented v1 limit).

### 2026-08-05 — MAX_ROUNDS_PER_ROOM = 12 (nearby Want cap; rematch UX deferred)

- SoT: `constants/max-rounds-per-room.ts`. Nearby Want/gaps/`haveRoundsCompleteForN` / lobby advertise-stop use `0..min(N,12)-1`.
- Product rematch stop / «Нова гра» / room winners CTA — TODO in ADR-023 (MAX_ROUNDS_PER_ROOM).

### 2026-08-05 — Nearby advertise-stop + hybrid availability (ADR-023)

- Want capped priors `0..min(N,12)-1`; contact all discovered hosts for HaveAck; hybrid `isAvailable` = LAN ∨ BLE; play sync without new OS prompt; peer stats backfill off in v1.

### 2026-08-05 — Nearby archive sync review fixes (ADR-023)

- Critical: finalize gate; import `gameId`+wantRounds; HaveAck trusted after Want + ∩ served (TCP/BLE); UDP untrusted; fetchMissing settler barrier; Android NEARBY_WIFI_DEVICES only API 33+.
- iOS `os-pending` → granted only after successful import; live `getHaveRounds`; UDP uses live `hostHandlers`; `setHaveRounds` trust required; residual hostile roster-uid spoof documented in ADR-023.

### 2026-08-04 — Nearby archive sync (ADR-023)

- Shipped local P2P gap-fill: `lib/online/nearby/**`, hooks on join/lobby/play QR. LAN UDP+TCP + BLE GATT hybrid (see top note).
- **Rebuild required** after pull: udp/tcp-socket + munim-bluetooth/nitro + Local Network / Bluetooth strings + Expo plugin.
- Manual smoke: same Wi‑Fi (LAN) and no shared LAN (BLE); TCP/BLE HaveAck stops lobby advertise (UDP alone must not).

### 2026-08-04 — Review triage: fix hung auth only; do not reopen SLA / provisional

- **Do fix:** hung `ensureAnonymousAuth` in `subscribeSessionWordMaps` → `WORD_MAPS_AUTH_TIMEOUT_MS` (15s) → `unavailable` without attach; late auth no attach; cancel during wait still silent; still auth-before-attach (P0).
- **Do fix (play Retry):** keep `mapsSyncFailed` banner until authoritative seed — do not optimistic-dismiss on Retry/`mapsRetryNonce` (roster hung-cap parity).
- **Do not “fix” I2 / I3 SLA:** Play ~72s fail-loud before banner is **product signed-off** (`known-issues` soft-timeout + ADR-022). No parallel get / eager supersede / budget shorten.
- **Do not “fix” I3 with provisional latch:** rematch-before-seed empty survival is the cost of ignoring provisional for freeze (C1). Escape = archive / mapsUnavailable / Home — not provisional pin.
- **I4:** commit split is process only if product asks. Unstage unrelated dictionary whitelist from ADR-022 stage.

### 2026-08-03 — ADR-022 review: empty-listen vs late fetch + play remount

- **C1:** Empty authoritative listen must **not** permanently stale-out a delayed non-empty bootstrap fetch (parent `session_word_maps/{id}` vs child `wordPlayers` skew during rematch wipe). Open-apply rich fetch over empty `lastAppliedMaps`; do **not** complete empty bootstrap while `fetchSettled===false` — hung-cap sets `mapsUnavailable` CTA only (listen/fetch stay alive).
- **P0:** `subscribeSessionWordMaps` awaits `ensureAnonymousAuth` **before** onChild*/seed get (cancel during auth wait → no `unavailable`). Hung auth → timeout → `unavailable` (Retry path). Roster cold open must not PD-abandon solely because auth/App Check is not ready yet.
- **I1:** Play remounts maps on `unavailable` even after authoritative seed. Roster/left post-bootstrap: remount once with SoT preserved → then `mapsUnavailable` + `wordsBootstrapComplete=false` so left/results CTA gates fire (not silent death).
- **I2:** Seed get is **single-flight** (no parallel hung gets after soft-timeout). Soft-timeout does **not** burn `seedAttempt` (only `startSeedGet`). Per-get soft-tick cap (= `seedGetMaxAttempts`) abandons forever-hung early gets (I1-R1). Play seed budget 3 + fail-loud after MAX_RESUBSCRIBES=2 then **stop** auto-remount until Retry. Play fail-loud is a **banner**.
- **I3:** `tryFetchSessionWordMaps` reads the same `wordPlayers` node as live seed get.
- **I4 / C1 hung-cap Retry:** Do **not** remount (late rich). Do **not** dismiss CTA into naked survival spinner — keep `mapsUnavailable` + kick parallel rich-only `tryFetch`; primary fetch may still seal.
- **I5:** Play Retry epoch reset via `useLayoutEffect` (before maps subscribe effect).
- Manual Retry after post-bootstrap fail-loud preserves SoT via `remountPreserveRef` (no empty flash).
- Left: `shouldShowLeftMapsRetryCta` full-screen only when `!hasViewData`; painted left uses `shouldShowLeftMapsSyncBanner`.
- Results: `resolveResultsErrorCta` maps-retry only when `!hasFinishedViewData`; painted results keep RoundResultsView + banner. Loading gate must not spin when `mapsUnavailable` **or** painted words remain (post-paint Retry).
- Soft-timeout ticks = hang detector; `seedGetMaxAttempts` dual budget — hung get#1 keeps **get count 1** until abandon (accepted SLA; no parallel get).
- Shared `OnlineMapsSyncBanner` + `online.retryMapsSync` for play/results/left post-paint fail-loud.
- Mockups: `docs/wordreapers_screens.html` is gitignored — local **5** play OnlineMapsSyncBanner (над дошкою; banner до authoritative; Retry → mapsRetryNonce; не optimistic-dismiss), 7б pre-paint CTA, 7г rematch-survival+Home, 7в post-paint banner; PR exception for docs-sync.

### 2026-08-03 — Android browse load failed (auth race)

- Prod Android browseLoadFailed; iOS sims OK. Force-kill + cold start fixed it. App Check RTDB metrics at failure time: **outdated client** spike (not Invalid) → reads without App Check token on a warm half-init. Cause: browse gated only on App Check attach; needs full `ensureFirebaseReady` / `ensureAnonymousAuth` (`auth != null` on index).
- **Also:** after sticky bootstrap `error`, browse must `ensureFirebaseReady({ forceRetry: true })` (same as join) or refresh never recovers without process kill. Dual UI+service auth gate is intentional fail-loud. Map `APP_CHECK_TOKEN_EMPTY` via `APP_CHECK_` in `firebaseBootstrapErrorMessage`.

### 2026-08-03 — ADR-022 maps listen: listeners-first + get reconcile

- Do **not** `get` then attach `onChild*` on `wordPlayers` — wipe between resolve and attach sticks rich under ADR-020 empty-block.
- Safe pattern: attach children → buffer (coalesce by word key) → provisional (16ms) → `get` reconcile → deltas; soft-timeout is a **hang detector** (re-arm / abandon — **not** eager supersede); hard-fail retries with backoff; forever-hung get#1 → abandon after N soft ticks with get count 1; PD/cancel emit; never seal authoritative from children alone.
- **Soft-timeout:** do **not** bump `activeGetId` at timeout — lazy supersede only when the next `startSeedGet` runs (after hard-fail settle). Soft ticks do **not** queue a new get. After `seedGetMaxAttempts` soft ticks on the **same** in-flight get → `abandonSeedRetries`.
- **Provisional policy:** **play and results roster both ignore provisional** (spinner until authoritative/fetch or mapsUnavailable CTA; no 8s escape over provisional). Open SoT on first authoritative/non-empty fetch → later grow-only. Wipe-gate / freeze never from provisional. Rematch-before-freeze: keep maps sub via state (`lastFinishedCore`/`freezeAttempted`) + latch from late authoritative + finished snapshot.
- Replace modes: default `empty-clear-guard`; play/freeze grow-only after seed; **results roster: open SoT on first authoritative/non-empty fetch, then grow-only** (not «always grow-only from first non-empty»).
- After seed `unavailable`: teardown children (no zombie ignore); results roster uses `ROSTER_WORD_MAPS_SEED_GET_MAX_ATTEMPTS` (3) then one resubscribe with max 1 attempt → `mapsUnavailable` + **Retry** CTA (`retryMapsListen`); play remounts maps subscribe on every `unavailable` (including post-seed), fail-loud after `PLAY_MAPS_UNAVAILABLE_MAX_RESUBSCRIBES` (2) with seed attempts `PLAY_WORD_MAPS_SEED_GET_MAX_ATTEMPTS` (3), then **stop** auto-remount until manual Retry (not unbounded).
- Results CTA order: `resolveResultsErrorCta` → `maps-retry` before `rematch-home` (rematch+unavailable must keep retry).
- Results empty authoritative: do not complete bootstrap until fetch settles; hung-cap → `mapsUnavailable` (not empty bootstrap / survival close); late non-empty fetch open-applies over empty listen (wipe race).
- Play maps unavailable: remount until fail-loud max, then **stop** until Retry; separate `mapsSyncFailed` banner (not shared `loadError`); clear on **authoritative** only (Retry remount keeps banner; `gameId` change clears); session listen stays separate; Retry epoch reset in `useLayoutEffect`.
- `subscribeSessionWordMaps`: auth-first; **single-flight** seed get; cancel during auth wait does not emit unavailable.
- `tryFetchSessionWordMaps` / listen seed both use `wordPlayers` path.
- Results words-loading (finished **or** rematch-survival): always Home via `createResultsHomePress('words-loading')` + Stack.Screen (no bare spinner trap; no provisional time-escape).
- Rematch-survival: maps sub + latch **waiting only** (not next `playing`); close after empty authoritative bootstrap **only after** `RESULTS_REMATCH_SURVIVAL_EMPTY_CLOSE_GRACE_MS` (2.5s) of continuous empty+no-pending **and** `mapsUnavailable` is false (late child latch / fail-loud); rematch-home CTA suppressed while `isResultsRematchSurvivalActive`.
- Roster unavailable remount: preserve SoT only if **rich** or bootstrap already complete — never preserve incomplete empty (restarts tryFetch; C1 wipe-race).
- Play session effect: `ensureAnonymousAuth` reject → `loadError` + `loading=false` (never bare `.then` without catch after maps/session split).
- Empty `{}` / false-only word children → remove key (no ghost keys for `ensureSessionWordMapsEmptyForRoundStart`).
- Playing leaf rules stay append-only (`newData.exists()` on uid leaves) — grow-only matches no mid-play client delete.
- Play maps effect calls `subscribeSessionWordMaps` directly (auth inside subscribe; no outer `ensureAnonymousAuth().then` without catch).
- Mockups: `docs/wordreapers_screens.html` is gitignored — local 7б pre-paint CTA, 7г rematch-survival+Home, 7в post-paint banner; play screen 5 has maps banner; PR exception for docs-sync.

### 2026-08-03 — Production gate: sync maps retry + wipe-before-play + legacy RTDB

- P1: legacy empty+counts → maps fallthrough (`retryable` / finalize from maps), never silent `done`.
- P2: `ensureSessionWordMapsEmptyForRoundStart` before play; playing rich recovery after 8s post-exhaustion (no accept-rich without wipe-before-play).
- P3 (product exception): **keep** `player_words` rules + score/wordCount caps for outdated store clients during review; CF no longer purges `player_words`; wipe/rules removal = **future** release after store approval + legacy deprecation (ADR-021 / `firebase_schema.md`).
- I1: `applyWordSubmitToWordPlayersShard` counts `=== true` only.

- CRITICAL: legacy archive finalize must not write zero stats — extract object keys or skip finalize when counts claim words (`archive-player-words-for-stats`).
- `globalWordCount` / `recomputeSessionPlayerScores`: count only `=== true` leaves.
- Submit: parent get fail → unique until listener (no `assumeShared` normal).
- Play maps exhaustion: more force-sync retries + best-effort `clearSessionWordMaps` + delayed empty re-fetch (still no accept-rich).

### 2026-08-03 — Results rematch-before-bootstrap + lexicon/submit UX

- C1: pending latch after authoritative bootstrap (or rematch-survival from late authoritative + finished snapshot); keep maps sub after rematch until freeze; rematch with no freeze/archive → `shouldShowResultsUnavailableAfterRematch` error CTA. Provisional-rich must not pin/freeze.
- I2: `RoundResultsView` shows word lists while lexicon loads (corner spinner only).
- I3: `submitOnlineWord` returns `NETWORK` via `isFirebaseNetworkError` (not always `SESSION_MISSING`).
- Deploy: rules+app together already in `firebase_schema.md`; `player_words` post-release cleanup checklist unchanged.

### 2026-08-03 — Left resume cold-start + results freeze round guards

- Left: cold-start `resumeRound < liveRound` while playing → pin resume (not live); late AsyncStorage resume replaces newer live pin via `nextLeftAtAfterResumePointer`.
- Results: empty→rich freeze upgrade only when frozen/live(/viewing) `baseWordRound` match — no rematch N+1 bleed.
- Results: `nextResultsFreezePending` keeps rich over empty wipe **same-round only** — never `{ session: N+1, words: N }`.

### 2026-08-03 — Finalize gate + rematch wipe QA + deploy

- C1: never `finalizeOnlineRoundForPlayer` while `shouldSkipEmptyArchiveWords` (`shouldFinalizeOnlineResultsStats`); escape may unstick spinner but must not lock zero stats.
- I1 (accepted): after force-sync exhaustion, play stays empty until authoritative maps wipe — do **not** restore `acceptRichWhileAwaiting`. Manual QA: rematch wipe → empty → new words; delayed wipe must eventually empty then accept new submits.
- I2: release deploy **rules + app together** (or rules first); do not mix old submit clients with new append-only rules / shard-only app. Post-release: wipe `player_words` + delete score fields per `firebase_schema.md`.
- I4: multi-player rematch without local archive → `errorOpenResultsFailed` on time-up modal (retry / Home); no silent partial peer archive.
- M1: bootstrap completes only on maps `snapshot` / successful fetch — **not** on `unavailable`.

### 2026-08-02 — Review C1 spinner escape + C2 no acceptRich after exhaustion

- C1: **do not** time-escape bootstrap after historical 8s (removed export — that painted provisional as final). Spinner until authoritative bootstrap or mapsUnavailable CTA; hook completes only on snapshot/successful fetch. Empty-claims uses `RESULTS_EMPTY_CLAIMS_ESCAPE_MS` separately.
- C2: removed `acceptRichWhileAwaiting`; exhaustion empties UI and waits for wipe empty before any rich apply.
- I1: play standings merge own/optimistic via `sessionWithWordPlayersForExit`.
- Mixed old/new clients: deploy rules+app together; score caps are legacy-only until post-release field delete.

### 2026-08-02 — Review C1/I1–I4 results freeze + left pin + archive

- C1/I4: roster words bootstrap only on snapshot/successful fetch; no unavailable/escape complete; empty freeze can upgrade; loading does not escape incomplete bootstrap into «0 слів».
- I1: resume pin kept on rematch advance (same as live pin).
- I2: multi-player rematch ensure returns false (no partial peer final archive); solo seed ok.
- I3: successful empty maps + no claims → save empty archive.
- I5: stateful dual-UID submit unit test; rules already cover parent/leaf/append-only.

### 2026-08-02 — Review: mid-play empty clear + post-join maps fail + leaf assumeShared

- Mid-play authoritative empty (`allowAuthoritativeEmpty` / score-path rollback) removed; empty wipe only via `awaitingEmptySync` / exhaustion.
- `resolvePostJoinRouteWithMaps`: retry maps; on fail use same-timer active-round cache for round-0 offline scorer → play; no cache → results (not play-over-route inactive).
- Leaf submit + parent `get` fail → success with self-only players (optimistic unique until maps listener); do not invent `assumeShared`/`normal`.
- Promoted to known-issues + ADR-020.

### 2026-08-01 — Submit finish race + archive pending + spinner escape

- Submit: shards are append-only while `playing` (no leaf delete / no production shard rollback).
- Finish race after shard: session already `finished` → return `{ ok: true }` so play keeps optimistic word. Rare maps⊃word / totals omit word desync — **accepted** (no reconcile).
- `persistLocalArchive` → `saved` | `skipped` | `skipped_retryable`; pending not cleared on soft-skip (`persistFinishedRoundForPlayer` **and** sync-coordinator `done`/`retryable`).
- Exit `skipped_retryable` → `markPendingRoundArchive` so sync can retry after #1 fix.
- Results empty+claims loading escapes after `RESULTS_EMPTY_CLAIMS_ESCAPE_MS` (8s) when no freeze/pending/archive.
- Manual QA rematch: wipe → empty list before new submits; force-sync exhaustion shows empty but keeps latch until authoritative empty (no permanent stale-rich).
- Pre-fix round-finished pushes without `baseWordRound`: tap ignored (tester-only).
- ADR-013 updated: parent-word shard TX + live demotion deltas (closes delayed +2 / absolute peers races). Post-release: wipe rules/CF `player_words` per `firebase_schema.md`.

### 2026-08-01 — Results empty freeze (C1) + archive empty wipe

- `wordsBootstrapComplete` only after maps `snapshot` / successful fetch — never on disable, fetch `!ok`, or `unavailable` (stale-true empty freeze).
- Bootstrap does **not** time-escape after 8s (historical escape constant removed from exports). Exit via authoritative complete or `mapsUnavailable` / `resolveResultsErrorCta`; freeze still waits for authoritative maps.
- `nextResultsFreezePending` + freeze source prefer rich pending over empty live while still `finished`; no latch/freeze from provisional.
- Archive: `shouldSkipEmptyArchiveWords` on RTDB fetch paths **and** `persistLocalArchive` (results/exit); finalize gated by `shouldFinalizeOnlineResultsStats`.

### 2026-08-01 — Review follow-up: results hang (I1) + rematch empty exhaustion (I2)

- Results loading/freeze gates only on `wordsBootstrapComplete` (no wordCount match — ADR-020).
- I2: force-sync exhaustion applies **empty** maps, keeps `awaitingEmptySync` until authoritative empty (no `acceptRichWhileAwaiting` — prior-round rich must not apply). ~3×500ms retries.
- I3: rules/CF `player_words` stay until post-release wipe checklist in `firebase_schema.md` (not a client merge blocker).
- I4: join uses `requireSessionWordMaps` fail-loud (no soft-empty) — product OK.
- M5: play clears left-resume via `clearLeftOnlineResumeForGame` only for current `gameId`.

### 2026-08-01 — Left results pin must not fall through to later rematch

- Left/results: if `leftAt` / `viewingBaseWordRound` is set and live `baseWordRound` differs, do not display live session/words. Promote playing snapshot → frozen when rematch advanced; persist archive on «Переглянути результати».
- Follow-up: stale `leftOnlineResume` after rematch/rejoin must not pin an older round while live `playing` — `nextLeftAtBaseWordRound` (resume vs live source) + clear resume on active play.
- Round-finished local push must carry `baseWordRound` and open `onlineResultsRoute(gameId, round)`; results reset freeze on pin change.
- Results: eager `archiveRecoveryPending` when viewing pin set (no `errorRoomNotFound` flash); `wordsSnapshot` never falls through to live on pin miss; submit outer-catch rolls back committed shard.
- Play: remote submit fail replaces optimistic «Слово зараховано» via `feedbackForFailedOnlineSubmit`.

### 2026-07-31 — Play maps force-sync: empty wipe preferred, exhaustion escape

- After round reset, `decidePlayMapsForceSync` rejects non-empty and keeps `awaitingEmptySync`. Hook retries `tryFetchSessionWordMaps` (~500ms × up to 3). Prefer empty wipe; if still rich **or** fetch keeps failing after retries, exhaustion applies empty UI and keeps awaiting until authoritative empty (not accept-rich).
- Results: `resolveResultsFreezeSource` + pending pin for rematch-before-freeze; roster disable keeps last words; **reset freeze/pending/archive refs on `gameId` change**. Roster bootstrap uses `tryFetchSessionWordMaps` (no apply empty on `!ok`).
- Left: `resolveLeftWordsSnapshot`; `persistFinishedRoundFromFirebase` throws on maps fail for freeze retry.
- ADR-020: no mid-round cache→RTDB restore while session exists.
- Pre-v4 / object-shaped finished archives: `isLegacyFinishedArchiveWords` → not stale; archive refresh skips overwrite (empty UI without destroying disk shape).
- Play exit/Home: `sessionWithWordPlayersForExit` + `myWords` into active-round cache; optimistic `acceptWord.display` until lexicon has the key; results **both** tabs wait on `lexiconLoading` when `globalWords.length > 0`. Join/finish paths use `requireSessionWordMaps` / `tryFetch` only (soft `fetchSessionWordMaps` removed).
- `finishGameSessionIfExpired` is leaf-path status finish only (no maps fetch). Play expiry retries via `onUncommitted` + `finishRetryBackoffMs`.

### 2026-07-31 — Accepted: no legacy active-round `words` migration

- Pre-`wordPlayers` AsyncStorage active-round entries that only stored per-player `words` are not migrated on read (same tester-only policy as v3 finished archives). Mid-round upgrade may fail to rejoin orphaned word lists from that old shape; maps + current cache format are the only restore path.

### 2026-07-31 — Post-release: wipe legacy `player_words`

- Client no longer reads/writes `player_words`. Follow-up after store release: wipe RTDB nodes → remove rules branch → drop CF purge path → deploy (order in `firebase_schema.md`). Until then rules/CF still mention the path on purpose.

### 2026-07-30 — Presence cleanup never writes RTDB

- `usePlayerOnlinePresence` unmount/`enabled` flicker used to call `voluntaryLeaveWaitingLobbyIfMember` (later offline-only). That flashed lobby peers offline and caused CM2L7 `hasLeft`. Cleanup is now unsubscribe + `consumePresenceHandoff` only. Promoted: `known-issues.md`, ADR-004, §7.

### 2026-07-30 — App Check Android: App signing SHA required (RN67E Verified)

- Console Invalid on Android was Upload-only fingerprint (`DD:18`) vs store App signing (`41:D6`). Both must be in App Check Play Integrity. Confirmed: `RN67E` → RTDB 100% Verified. See `known-issues.md`. Client subscribe/presence no longer soft-fail App Check (retry then skip `onValue`).

### 2026-07-28 — Finish must not rewrite peer presence (LRAHP)

- R62F9 `online`/`hasLeft` validate blocked whole-session finish → stuck `playing` → rematch `REMATCH_FAILED`. Leaf-path finish + unchanged validate + rematch heal. Deploy rules.

### 2026-07-28 — Rematch PD must not false-join (R62F9 forks)

- Metro: both clients `update … permission_denied` then `joined rematch lobby (peer already opened waiting)` → divergent pick-word. Fix: status-only CAS + follow-up without peer presence; follow-up PD ≠ join. Promoted to `known-issues.md`.

### 2026-07-28 — Second rematch must not rewrite players map (R62F9)

- `players/.write` / session write cascade allowed peer `online` while already `waiting` → second «Грати ще» logged `opened rematch lobby` with peer `off` sans latch → Home/rejoin «Гравці (1)». Fix: rematch leaf paths + `.validate` on `online`/`hasLeft` (peer only `finished→waiting`); PD→join.

### 2026-07-28 — Pick-word seat yield must not require focus (ZF6U4)

- Direct rematch→pick-word + `isFocused` gate left early rematcher on pick-word while rightful peer opted in on the other sim. Fix: `shouldLeavePickWordScreen` without focus; sync picker from pick-word; re-check picker before base-word write.

### 2026-07-28 — Rematch must not use whole-session transaction (T2ZJU)

- Results `markPlayerOffline` on `players/$uid/online` aborts parent `runTransaction` → `maxretry`. Live rematch claims with **status-only** tx + follow-up `update` (no peer presence); AH2TN via join when status already waiting.

### 2026-07-28 — Offline rematch picker must not hold seat

- Product: background/lock/force-quit picker → transfer seat to next online. Latch = lobby visibility only. Promoted to `known-issues.md` + §4 Eligible.

### 2026-07-28 — Rematch Home leave vs background rejoin (NLD7S)

- Metro marker: `left the round early` then `rejoined room after leaving` within ~30ms. Results Home with frozen finished + live waiting needed leave guard; `rejoinExistingPlayer` must not clear `hasLeft` without `reviveAfterLeave`. Promoted to `known-issues.md`.

### 2026-07-24 — Review follow-up: §5 roster + capped lobby heal

- Synced §5 `liveRoundPlayerUids` wording with §3 / `waitingLobbyOptInUids` (latch-inclusive at start). Rematch lobby base-word RTDB heal poll capped at 15×2s via `lobby-rematch-base-word-heal`; focus/AppState/`justOptedIn` heals unchanged.

### 2026-07-24 — 75AGB picker leave must transfer seat

- `hasLeft` forfeits rematch picker/visibility even with latch; only brief offline without hasLeft keeps durable seat. `leaveGameSession` already calls `syncLobbyPickerState`.

### 2026-07-24 — AH2TN second rematch rewrite

- Symptom log: first `opened rematch lobby` then second also `opened rematch lobby` (not `joined…`) with peer `off` and no latch → divergent base words. Fix: rematch is atomic `update()`; already-waiting → join only (peer rewrite denied by rules once `waiting`).

### 2026-07-24 — Roster details in multiplayer Metro logs

- `formatLiveRosterDetails`: `liveUids=[…] roster=Name#uid[on|off,live,latch,pick,chose,wN]` on start / rematch / rejoin / opt-in.

### 2026-07-24 — WAGTJ solo play UI vs peer vote

- Starter solo chrome while peer has words + early-finish vote: `hasMultiplayerRound` ignored offline peers who already scored; missing `liveRoundPlayerUids` entry. Heal via score-aware multipplayer + play shouldRejoin when online/scoring but not in live uids.

### 2026-07-24 — WAGTJ false offline at round start

- Lobby must not flip presence policy to `background-and-inactive` on `waiting→playing` while still mounted — remount cleanup marks offline before play handoff. Always `lobbyPresenceOfflinePolicy()` → `background-only`.

### 2026-07-24 — Dev multiplayer action logs

- Unified logger: `lib/debug/dev-log.ts` + `EXPO_PUBLIC_LOG_LEVEL` (`none|error|event|detail|all`). Prod always silent (`!__DEV__`). Default in dev: `event` (local actions). Remote peer observations need `detail+`. Lexicon / submitWord timings need `all` (no longer emit on bare `__DEV__`).

### 2026-07-24 — JZ4Y5 late joiner hides first rematcher

- Blink on peer list when late joiner comes online was `setPlayerOnlinePresence` → `reconcileLobbyPickerState` clearing word. Stale `hasLeft` also blocked durable latch/picker/word visibility. Fix: durable opt-in survives hasLeft; no picker reconcile on presence; pick-word `background-only`.

### 2026-07-24 — False lobby offline from multi-sim inactive

- Waiting lobby presence: `background-only` (not inactive). Play keeps inactive→offline for lock-screen votes. Heal while waiting for rematch baseWord.

### 2026-07-24 — Rematch visibility: late joiner steals pick

- Root was not rotation math: late joiner’s client hid offline first rematcher (no latch/word yet on pick-word). `baseWordPickerUid` now counts as opt-in for visibility/eligibility.

### 2026-07-24 — Rematch lobby asymmetric roster (YZS46)

- First rematcher sees 2; picker sees 1. Local `rematchOptInLatched` ≠ RTDB latch. Latch refresh must run even when AppState inactive; do not mark online while inactive.

### 2026-07-24 — Play UI frozen after screen lock (taps still submit)

- Screenshot: peer standings 6 words vs local 5; timer ~1 min ahead; floating ghost «К»; empty draft. Heal on AppState `active`: clock, clear flies, remount keyboard, refetch own words.

### 2026-07-24 — Standings sheet room progress

- Standings sheet room progress = `Object.keys(displaySession.wordPlayers).length` (same as results `totalDistinctWords`); details must read `displaySession`, not live rematch session. ✕ close (no «Закрити»); tap room code copies via `expo-clipboard` (needs native rebuild after pod install).
- `pod install` failing with Expo* Local Podspecs / Podfile.lock snapshot mismatch after adding a native Expo module: regenerate lock — `cd ios && rm -f Podfile.lock && pod install` (then `npm run ios`).

### 2026-07-24 — Time-up results error trapped user (no Home)

- timeout skipped local archive; modal had no escape. Seed coerce + Home on error.

### 2026-07-24 — Screen lock at rematch start drops liveRoundPlayerUids

- `waitingLobbyOptInUids` was online-only; latch/chosenBy + always include starter.

### 2026-07-24 — «Грати ще» stuck on results while peer lobby shows joiner

- Waiting rematch: navigate after latch+read; presence backgrounded. Playing still awaits presence.

### 2026-07-24 — Second rematcher steals pick (DSSN2)

- Round-3 rightful chooser’s word cleared when peer opted in (multi-sim offline). Sticky chosenBy + clear only when another player is rightful; rematch latch write self-only.

### 2026-07-23 — Empty results list + player_words permission_denied

- Rematch/waiting denies peer `player_words` reads; results showed «0 слів» with standings. Archive-first for pinned viewing round; clear words after `waiting`; spinner until words ready.

### 2026-07-24 — Seat hold removed (WXAGN)

- Product: first rematcher picks/starts; room-join-order rotation among opted-in; rightful later joiner takes seat before start. Seat hold contradicted §4 — removed.

### 2026-07-23 — Round-2 pick stuck on organizer (QBQ4W)

- chosenBy lock blocked rotation when second rematcher joined. Removed lock; latch eligibility remains for inactive steal case.

### 2026-07-23 — Rematch lobby hides first rematcher (XM8EW)

- Second «Грати ще» + multi-sim focus: peer `online:false` without latch → hidden. Concurrent rematch `resultsExitedBy: {actor}` object replace wiped first rematcher's latch; picker rotation cleared their word. Fix: leaf latch writes + presence re-latch + lock picker to chosenBy while word stands.

### 2026-07-23 — Join fails on L8NN5 while host lobby looks open

- RTDB truth: orphan shell (no `status`/`organizerId`) with leftover word/players. Join → `ROOM_NOT_JOINABLE` mislabeled as «приєднання закрито»; host zombie UI from heal that did not clear on null. Fix: orphan → `ROOM_NOT_FOUND`; lobby heal clears local session.

### 2026-07-23 — Rematch second joiner steals pick-word (L8NN5)

- ChosenBy-only was not enough (screenshot: org БЕРЕЗЕЦЬ/2 players vs peer ЛЕПІДОСИРЕН/1; RTDB had org word). Durable `resultsExitedBy` latch through rematch waiting + lobby AppState/focus RTDB heal. Full Metro reload before retesting two sims.

### 2026-07-23 — Stale timer local finish vs remote add-time/pause

- Frozen client (missed listener) keeps old `timerEndsAt`; peer extends/pauses solo. Expire finish fails on RTDB then forced local results. Heal: resync before `forceLocalRoundOver`. Hang not tied to organizer role.

### 2026-07-23 — Pause vote peer miss + stuck cancel

- Same class as resume: RN Modal for session votes + cancel with `applyLocally: false` and no local clear → dead cancel. Overlay + optimistic clear + RTDB re-read. Full Metro reload required if presence HMR still throws `beginPresenceWrite`.

### 2026-07-23 — Presence repair crash + ghost resume after disconnect

- After background: `repairPresenceIntentIfNeeded` threw `undefined is not a function` (`latestPresenceIntent` / HMR stale binding). Soften via `presenceWriteQueue.latestIntent` + guard. Vote txs: `applyLocally: false` so aborted disconnect cannot leave proposer-only `resumeVote` UI. Full Metro reload if HMR still looks wrong.

### 2026-07-23 — Self offline on pause UI after unlock

- Lock → unlock on pause: peer correctly saw «в грі»; unlocking client still showed self «не в грі». Heal: `markPlayerOnline` then `tryRead` on active; repair superseded offline writes.

### 2026-07-23 — Stuck presence toasts after pause (two simulators)

- Timer 16:32 → 13:33 (~3 min) with toasts still up — dismiss was frozen under AppState `inactive`, not a 3.8s UX wait. Fixed via wall-clock prune + opacity/fade fix + presence coalesce.

### 2026-07-23 — Resume vote invisible on peer pause overlay

- Peer kept «Готове продовжувати» while proposer had live `resumeVote` (two simulators). Pause overlay moved off RN Modal → absolute fill; AppState `active` re-reads session via `tryReadGameSessionSnapshot`.
- Related: inactive→offline presence still applies when switching simulator focus — required set can shrink / auto-resume if peer is offline in RTDB.

### 2026-07-23 — Review follow-ups (results ensure UX + expire dedupe)

- `navigateToResults`: pin local time-up round; hold rematch round-key; ensure fail-fast incl. finished N+1; archive before replace for both `already_finished` and `rematch_advanced` (RTDB write else local seed); catch → modal error; expire draft clear only when not deferring.
- Expire skip: `shouldSkipExpireFinishForPinnedTimeUp` uses `roundOverPendingResults` + pin (covers natural RTDB finish, not only `localRoundOverForced`).
- Add-time clearing time-up: bumps `resultsNavEpochRef`, clears busy/error/inFlight so stale `errorOpenResultsFailed` cannot reappear on next time-up.
- `useLiveRosterPlayerWords`: early-return (`!enabled` / empty roster) sets bootstrap complete via `shouldCompleteWordsBootstrapWithoutFetch`.
- Rematch lobby: lobby→pick-word is **`push` + `fromLobby`** (not `replace` — that fired leave-home via `useSyncedStackBack`); pick-word skips presence when stacked; focus RTDB re-read; picker-only baseWord write; **opt-in latch** so peer becoming picker does not bounce first player to prior results.
- High audit fixes (2026-07-23): archive rematch uses `rematchWaitingPlayerPatch`; lobby auto-join no longer treats organizer as opted-in by default; pause vote 30s silence → activate.
- Presence: AppState `inactive` (iOS lock) also → `markPlayerOffline` — lock often never reaches `background`.
- Residual: ~2s pre-`forceLocalRoundOver` rematch window (known-issues); `router.replace` rarely throws — busy may stick until unmount if nav no-ops.
- Commit hygiene: prefer 3–4 commits (rejoin/routing | timer/results | word reset | docs) — not one mixed commit. Branch may be diverged from `origin/dev`.

### 2026-07-21 — Post-1.3.5 multiplayer stability fixes

- Shipped surgical fixes (not full online rollback): atomic `rejoinExistingPlayer`, post-join `isLiveParticipant` + `fromJoin` archive skip, play local word clear on `baseWordRound` bump, AppState-active presence reconcile, 00:00 submit gate + local round-over after failed `finishGameSessionIfExpired`.
- App Check field metrics: see 2026-07-18 note (ops only until installs on 1.4.2+).

### 2026-07-18 — Store App Check 100% Invalid (web appId + missing EXPO_PUBLIC prod flag)

- Confirmed via Firebase MCP: Android `…:android:6c8ea52a…`, iOS `…:ios:1bf134e3…`, web `…:web:a2fdb146…`. Local/CI used a **web** single `EXPO_PUBLIC_FIREBASE_APP_ID` (removed — platform ids only; see ADR-016).
- Android SHA list already has SHA_1 `f75a2267…` + SHA_256 `dd18df5b…` — still verify Play Console **App signing** cert matches (upload vs Google Play App Signing).
- Fix shipped in code: `EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION` on EAS production + platform app ids from `.env` / GitHub `release` secrets (not hardcoded, no web fallback). Needs a new store build (1.4.2+) to validate Verified metrics.
- Manual Console checks: App Check → each app → Play Integrity / App Attest registered; do not Enforce yet.

### 2026-07-17 — Selective CI: typecheck needs functions deps

- Root `npm run typecheck` runs `tsc -p tsconfig.node.json`, which includes `functions/src/**` and `lib/**`; `@types/node` resolves through the functions install. Without `npm ci --prefix functions`, typecheck fails (`Cannot find name 'node:fs'`, missing `firebase-admin`) across `functions/src`, `lib/dictionary`, and `tests`.
- Fix in `.github/workflows/ci.yml`: selective PR job sets `functions_ci=true` whenever `run_typecheck=true` (post-rule after category flags).
- Repro locally: `mv functions/node_modules aside && npm run typecheck` → same errors.

### 2026-07-17 — VirtualizedList warning: results lexicon gate

- RN warning `dt`/`prevDt` are scroll-event gaps, not render duration; needs `contentLength > 5× viewport`. Confirmed source: play `WordList` (~50 rows), not results; often false positive after pause between scrolls.
- Results: `resolveResultsWordListLexicon` keeps found-only list stable until «Показати всі можливі слова» is on (avoids rebuild when lexicon finishes).
- `ResultsGlobalWordList`: hoist `t`/theme out of each row.
- Test: `tests/round-playable-lexicon.test.ts`

### 2026-07-17 — WordList FlatList update cost (no UX change)

- Symptom: RN `VirtualizedList: large list that is slow to update` with ~60 accepted words (`dt` ~500ms+).
- Cause: full `map+sort` rebuilt every row object on accept; `renderItem` identity churned on prefix/entrance/highlight Sets.
- Change: `buildSortedWordListRows` reuses prior row identity + binary insert on single add; stable `renderItem` via snapshot ref + `extraData`.
- Test: `tests/word-list-rows.test.ts`

### 2026-07-17 — Training Firebase / App Check Invalid (production)

- Production Android (Play Integrity): paused training resume/finish correlated with Auth/RTDB **Invalid** App Check metrics while enforcement still off.
- Code fix: short-circuit `abandonOrganizerWaitingRoomForDraft` before Auth; reject empty App Check tokens; gate presence + public lobby browse. See `docs/known-issues.md`.
- Manual smoke (narrow): (1) clean app data → training pause/resume/finish → no Auth spike; (2) setup→solo without publish; (3) invite/publish from solo still works; (4) browse/join → Verified. Sync coordinator may still hit Firebase if non-solo archives exist on device.

### 2026-07-16 — Release CI: iOS ExpoModulesJSI Swift 6.3 requirement

- Symptom: after the deps bump (`222e87d`, `expo` `^57.0.0` → `~57.0.6` → `expo-modules-jsi@57.0.3`), iOS archive fails compiling `expo-modules-jsi` (`JavaScriptCodable+Date.swift:53` `type of expression is ambiguous`).
- Cause: SDK 57 `expo-modules-jsi` needs Swift **6.3** (Xcode 26.4+). Runner was `macos-15` pinned to Xcode 26.3 (Swift 6.2), which tops out that image. Not app code; not a patch-package case (Expo maintainers advise against patching, issue #46242).
- Fix: `runs-on: macos-26` + `xcode-version: '26.4'`. Fastlane vendor cache auto-rebuilds via Ruby-version stamp on the new image.

### 2026-07-16 — Release CI: Fastlane `libruby` mismatch after Ruby patch

- Symptom: iOS `eas build --local` → `fastlane --version` exit 1; `json` gem `linked to incompatible …/Ruby/3.3.11/…/libruby.3.3.dylib` while runner is 3.3.12.
- Cause: `actions/cache` key for `scripts/ci/vendor` used only `Gemfile.lock`; `ruby/setup-ruby` floated `3.3` → new patch; restored native gems from previous patch. Not an app-code regression.
- Fix: cache key includes resolved `RUBY_VERSION`; `ensure-fastlane.sh` stamps + rebuilds on mismatch. See `docs/release-ci.md` troubleshooting.

### 2026-07-16 — Android lexicon build perf (client-only)

- Root fix kept: `DictionaryIndex` O(1) `Set` + `Intl.Collator('uk')` sort (+ commit-only setup prefetch). Speculative letter-mask / preferFastWallClock experiments reverted.
- Verified ~3–6s for 5773 accepts on S931B (`yieldEveryMs` 64). No play/solo blocking spinner — lexicon builds in background while the screen mounts; word submit already has ~1s debounce.
- iOS suggest / setup hint: typing uses soft `pause` (no cache eviction); deferred `onPressOut` clear keeps suppress until `onPress`.

### 2026-07-15 — Dead code cleanup

- Removed orphan modules (`leave-organizer-setup`, `session-participants`, unused `lib/game` barrel), unused exports (`PlusIcon`, `Stepper`, `withButtonFeedback`, …), and four test-only `lib/online` helpers (`resolve-rematch-navigation-route`, `restore-finished-round-to-firebase`, `sum-archived-word-count`, `voting-player-ids`) plus their dedicated tests. Pruned ~46 unused `uk.json` keys. No runtime behavior change.

### 2026-07-15 — Rematch starter solo UI after invite joins

- Room `6DGFA` rematch: `uniqueBonusEnabled: false` in RTDB with 3 `liveRoundPlayerUids` — latch update aborted by full `players` rewrite. Starter alone at round start kept solo UI. Fix: leaf score patches + hasMultiplayerRound online-peer fallback.

### 2026-07-15 — Last-second add-time propose freeze

- Symptom: proposer closes minute picker at 00:00; peers already finished; no vote; proposer frozen with no «Гру завершено».
- Fix path: await propose before close; finish-on-dismiss helpers in `add-time-vote.ts`; time-up only when picker closed. See `known-issues.md`.

### 2026-07-15 — Revert iOS input-lag “optimizations”

- User: hangs mid-word without toasts (e.g. «ЛЕЛЕ» last letter delayed seconds). Confirmed not toast-root. Pre-change iOS was fine; Android 100+ training was the original bug.
- Action: reverted compose island / contention store / deferred+transition experiments on play path. Kept `buildSoloWordListDisplay` memo + WordList Fabric row slots.
- Follow-up: «КОЛООН» + «Недоступні літери» — base word has only 2×О; extra О from lag/double-press before used-keys re-render. Debounce word-list `draftPrefix`; sync `draftKeyIndicesRef` on press.
- Lesson: on RN/iOS do not put `useDeferredValue` / `startTransition` beside draft; speculative isolation can regress more than it helps.

### 2026-07-15 — Release CI: `Could not find command "_2.6.9_"`

- After `vendor/bin` on PATH, a shell `bundle(){ bundle _2.6.9_ "$@"; }` hit a vendored `bundle` stub → `_2.6.9_` treated as a subcommand. Fix: absolute Bundler binary + invoke `fastlane` from PATH (not `bundle exec`).
- Also: bundletool download progress must go to stderr or it pollutes Play `--version_name`.

### 2026-07-15 — Release CI: iOS `spawn fastlane ENOENT`

- Local `eas build --platform ios` needs `fastlane` on PATH during the native build, not only for TestFlight upload. Install + binstubs via `ensure-fastlane.sh` before `eas build`.

### 2026-07-15 — Release CI: AAB overwritten + Bundler 1.x

- Local EAS `--output wordreapers.aab` + `buildArtifactPaths: mapping.txt` rewrote the AAB as ASCII mapping (~71MB `file: ASCII text`). Drop `buildArtifactPaths` from production when CI uses a single-file `--output`.
- `Gemfile.lock` `BUNDLED WITH 1.17.2` made Bundler 4 install 1.17.2 → `undefined method untaint` on Ruby 3.3. Lock to Bundler 2.6.9 + `ruby/setup-ruby` in the workflow.

### 2026-08-02 — Client-derived scores / shard-only submit (ADR-012/013 superseded)

- Live RTDB `players/*/score` writes and `x2Claim`/`x2Demoted` removed from **current** clients. Submit = `wordPlayers` shard only; standings via `buildLiveStandingsFromSession`. Play screen no longer calls `syncSessionPlayerScores`.
- Rules still allow capped score/wordCount (legacy clients). Post-release: **remove** those RTDB fields with the `player_words` wipe checklist — not lock-to-0. Local archives stamp derived totals; history/stats/results derive from `playerWords`/`wordPlayers`. Empty-archive gate uses maps + existing archive richness (not live wordCount). Finish no longer requires maps fetch.
- Review follow-up: pending-archive finalize derives standings from words; live membership/rejoin use `playerHasScoredInRound` (maps); wordPlayers leaf append-only while playing; play cache uses `sessionWithWordPlayersForExit`; results maps bootstrap does **not** time-escape after 8s (authoritative / mapsUnavailable CTA only).
- Orphan restore filters cache `wordPlayers` to actor uid only (peer multipath → PD); maps write failure rolls back the restored session root.
- Join no longer calls `requireSessionWordMaps` (was unused after score-path removal; threw after roster write → orphan uid).
- Post-join maps `!ok`: prefer play when still in live round (not silent results for round-0 offline scorers).
- Historical x2Claim one-shot demotion path deleted (see known-issues Status: Obsolete entries).

### 2026-07-14 — Submit latency (ADR-013; wordSet removed)

- **Updated 2026-08:** client path is shard `wordPlayers` only (no session score / x2Claim). Leaves append-only while `playing` (no shard rollback delete).
- Expire finish: `finishGameSessionIfExpired` leaf-path only (no maps fetch); play retries via `play-expire-finish` `onUncommitted` + `finishRetryBackoffMs`.
