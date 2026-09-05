# Known issues and regression log

Short record of non-trivial bugs that were fixed. Future agents: **search this file** before changing code in the listed areas.

Format: **Symptom → Cause → Fix → Area**

---

### 2026-09 — Offline results incomplete after rich local freeze

- **Symptom:** Player who locked the screen mid-round opened results later with fewer words than peers (e.g. 56 vs 89); RTDB still had the full tree.
- **Cause:** Non-empty local freeze (stale listen / Firebase disk cache) disabled results maps listen; upgrade path only handled empty→rich. Prefer-memory archive could also skip a richer server fetch.
- **Fix:** Grow-only upgrade for incomplete freezes; keep maps listen while live `finished` same round; archive always fetch∪pickRicherWordPlayers.
- **Test:** `tests/frozen-round-view.test.ts`, `tests/archive-finished-round-from-firebase.test.ts`, `tests/archive-words-gate.test.ts`
- **Area:** `lib/online/session/frozen-round-view.ts`, `app/online/results/[gameId].tsx`, `lib/online/session/archive-finished-round-from-firebase.ts`

### 2026-09 — RTDB diagnostics ↓ double-count on word-maps seed

- **Symptom:** With diagnostics collecting, ↓ JSON for a room was ~2× the `wordPlayers` tree on join/rematch.
- **Cause:** ADR-022 listen-first attaches `onChild*` before seed `get`; both paths called `instrumentedSnapshotVal` for the same initial tree.
- **Fix:** `instrumentedChildSnapshotVal(seeded, …)` skips child recording until authoritative seed; seed `get` remains the initial ↓ count (ADR-025 trade-off #4).
- **Test:** `tests/firebase/instrumentation.test.ts` (`instrumentedChildSnapshotVal`)
- **Area:** `lib/firebase/session-word-maps-service.ts`, `lib/firebase/rtdb-instrumentation.ts`

### 2026-08 — Rematch-survival wipe race (C1 wipe race)

- **Symptom:** Authoritative empty snapshot wiped rich `tryFetch` bootstrap on results/left.
- **Cause:** Results roster bootstrap completed on the first authoritative listen (even if empty) before the non-empty bootstrap fetch settled.
- **Fix:** `useLiveRosterPlayerWords` delay bootstrap-complete until fetch settles; apply non-empty fetch over empty seed if previous leaves are 0 (wipe race survival).
- **Test:** `tests/use-live-roster-player-words.test.tsx` (rich fetch over empty listen), `tests/frozen-round-view.test.ts`
- **Area:** `hooks/useLiveRosterPlayerWords.ts`, `lib/online/session/frozen-round-view.ts`

### 2026-08 — Nearby isComplete/gaps uncapped vs Want MAX (I1)

- **Symptom (review):** Want capped at `MAX_ROUNDS_PER_ROOM` but `expectedPriorRounds` / `haveRoundsCompleteForN` expected full `0..N-1` → for N>12 trusted HaveAck of `0..11` never stopped lobby advertise.
- **Fix:** Cap nearby priors (gaps + isComplete) via `MAX_ROUNDS_PER_ROOM` (same as Want); product rematch stop remains TODO.
- **Test:** `tests/max-rounds-per-room.test.ts` (N>MAX advertise-stop).
- **Area:** `missing-round-archives.ts`, `want-rounds.ts`

### 2026-08 — Hybrid fetchMissing bypassed blePhaseAllowed (I2)

- **Symptom (review):** `startHost` used `blePhaseAllowed`; `fetchMissing` only checked `ble.isAvailable` + budget + callback → denied + `bleTimeoutMs>0` could still enter BLE if SoT drifted.
- **Fix:** `fetchMissing` BLE phase requires `blePhaseAllowed(ble, liveOk)` (same as host).
- **Test:** `tests/nearby-hybrid-ble-deny-fetch.test.ts`.
- **Area:** `hybrid-transport.ts`

### 2026-08 — LAN-only OS fail permanently denied BLE (C1)

- **Symptom (review):** `requestNearbyOsPermissions({ includeBle: false })` LAN fail → `ensure` set global `denied` + BLE `'0'` even though BLE was never evaluated (playQr path).
- **Fix:** On `!granted`, persist only evaluated axes; global `denied` only when BLE was evaluated and both LAN+BLE failed.
- **Test:** `tests/nearby-permission-lan-ble-split.test.ts` (LAN-only fail).
- **Area:** `permission.ts`

### 2026-08 — BLE after LAN trusted completion with no byte gaps (I1)

- **Symptom (review):** Hybrid used full Want remaining after LAN, so completion-only LAN success could still open BLE scan.
- **Fix:** `byteGapRounds` + `seekCompletionAck`; BLE only for remaining gaps or completion when `!trustedWireCompleted`.
- **Test:** `tests/nearby-hybrid-full-want.test.ts`.
- **Area:** `hybrid-transport.ts`, `nearby-archive-sync.ts`, `nearby-archive-transport.ts`

### 2026-08 — allowBleProbe reopened BLE after explicit BT deny (I1)

- **Symptom (review):** After Android BT deny (`bleAllowed: false` / storage `'0'`), join/lobby `allowBleProbe: true` still set `bleTimeoutMs` and hybrid/host entered munim BLE — same `false` meant iOS unconfirmed and explicit deny.
- **Cause:** Boolean BLE cache collapsed unknown vs denied; `blePhaseAllowed` / sync probe treated any non-allowed as probe-eligible.
- **Fix:** Tri-state `unknown|allowed|denied`; probe only when unknown; iOS pending / LAN-only OS omit `bleAllowed` (do not write denied); missing BLE key stays unknown (not `'0'`).
- **Test:** `tests/nearby-permission-lan-ble-split.test.ts`, `tests/nearby-archive-coordinator.test.ts` (deny → bleTimeout 0 + lobby no probe).
- **Area:** `permission.ts`, `hybrid-transport.ts`, `nearby-archive-sync.ts`, `request-os-permissions.ts`

### 2026-08 — Coalesced play(false) still requested Android BT OS (C1)

- **Symptom (review):** join∩play coalesce kept `allowOsPermissionPrompt` via OR but sync-ensure called bare `requestNearbyOsPermissions()` (`includeBle` default true) → Android BT runtime dialog mid-play even with `allowBleProbe: false`.
- **Fix:** `requestNearbyOsPermissions({ includeBle: allowBleProbe === true && bleProbeLiveAllowed })` in sync-ensure.
- **Test:** `tests/nearby-archive-coordinator.test.ts` (coalesce `includeBle: false`).
- **Area:** `nearby-archive-sync.ts`, `request-os-permissions.ts`

### 2026-08 — In-flight join BLE probe survived play(false) (C1)

- **Symptom (review):** Join/browse `void maybeSync(allowBleProbe: true)` then navigate to play; coalesce AND only updated the **queue**, so an already-running `runNearbyArchiveSyncOnce` kept `bleTimeoutMs > 0` and hybrid could enter BLE mid-play (OS BT risk).
- **Cause:** Live probe preference was not suppressed until the next drain input; hybrid did not re-check before BLE phase.
- **Fix:** Module `bleProbeLiveAllowed` cleared immediately on `allowBleProbe !== true`; `isBlePhaseStillAllowed` on fetch input; hybrid skips BLE when gate false; reset gate when drain idle.
- **Test:** `tests/nearby-archive-coordinator.test.ts` (in-flight join→play gate).
- **Area:** `nearby-archive-sync.ts`, `hybrid-transport.ts`, `nearby-archive-transport.ts`

### 2026-08 — playQr ensure requested full BLE OS mid-round (I1)

- **Symptom (review):** `reconcileNearbyArchiveHost` always called full `requestNearbyOsPermissions` (munim/BT) even for `mode: 'playQr'` when status was `unknown`.
- **Fix:** `requestNearbyOsPermissions({ includeBle: false })` for playQr; ensure accepts only object results; `bleAllowed` only when explicit `true`.
- **Test:** `tests/nearby-sync-then-host-cycle.test.ts` (playQr LAN-only), `tests/nearby-archive-permission.test.ts` (object contract).
- **Area:** `request-os-permissions.ts`, `permission.ts`, `nearby-archive-sync.ts`

### 2026-08 — iOS optimistic bleAllowed caused mid-round BT prompt (C1)

- **Symptom (review):** iOS `requestNearbyOsPermissions` set `bleAllowed: true` with `pendingOsConfirmation` before any GATT use → play hydrate / QR host entered BLE and could show OS Bluetooth mid-round. Residual: `bleTimeoutMs` tied to `allowOsPermissionPrompt` + coalesce OR let join∩play open BLE; `fetchMissing` confirmed BLE after failed `startScan`.
- **Fix:** iOS `bleAllowed: false` until confirm; separate `allowBleProbe` (AND on coalesce); `bleTimeoutMs` only if confirmed \|\| probe; playQr no probe; confirm only after successful `startScan` / host advertise.
- **Test:** `tests/nearby-permission-lan-ble-split.test.ts`, `tests/nearby-archive-coordinator.test.ts` (coalesce bleBudget 0), `tests/nearby-ble-hybrid.test.ts` (failed startScan).
- **Area:** `request-os-permissions.ts`, `permission.ts`, `hybrid-transport.ts`, `nearby-archive-sync.ts`, `ble-transport.ts`, `hooks/useNearbyArchiveSync.ts`

### 2026-08 — Nearby host applyToken + BLE migrate opt-in (clean-final C1/I1)

- **Symptom (review):** (1) Stale `startHost` after QR/roster flap could overwrite live transport handlers when a newer cycle already claimed host; inactive rollback could also `close()` Gen2’s shared LAN server / clear BLE listeners. (2) Pre-split `granted` without BLE key migrated to `bleAllowed=true` → play hydrate could enter BLE and risk OS BT prompt.
- **Fix:** `applyToken` on host handlers; LAN closes only `server === myServer` / `udp === myUdp`; BLE `hostSetupEpoch` so stale setup cannot tear down Gen2; coalesce `allowOsPermissionPrompt` OR; missing BLE key stays `unknown` (not denied).
- **Test:** `tests/nearby-sync-then-host-cycle.test.ts` (clobber + Gen2 server ownership), `tests/nearby-permission-lan-ble-split.test.ts`, `tests/nearby-archive-coordinator.test.ts` (I2 coalesce).
- **Area:** `nearby-archive-sync.ts`, `*-transport.ts`, `permission.ts`

### 2026-08 — Play cold-start skipped BLE + hybrid BLE partial-Want

- **Symptom (review):** (1) Play sync (`allowOsPermissionPrompt: false`) never hydrated LAN/BLE capability caches → BLE off after process restart. (2) Hybrid BLE phase Wanted only `remaining` rounds → HaveAck ∩ served incomplete → lobby advertise linger.
- **Fix:** `hydrateNearbyCapabilitiesFromStorage()` on play path; BLE phase always Wants full `input.wantRounds`; playQr advertise only via `forceAdvertise`.
- **Test:** `tests/nearby-permission-lan-ble-split.test.ts` (C1 hydrate), `tests/nearby-hybrid-full-want.test.ts` (C2).
- **Area:** `permission.ts`, `nearby-archive-sync.ts`, `hybrid-transport.ts`

### 2026-08 — Nearby hook cleanup left host advertising during sync (C1)

- **Symptom (review):** Play QR close / roster flap only set `cancelled`; host kept advertising through LAN+BLE sync budget; BLE scan+advertise dual-role; stale reconcile could re-raise host after stop.
- **Cause:** Effect cleanup did not call `stopNearbyArchiveHost`; sync-then-host only on cold start; `isCurrent` checked only before `reconcileNearbyArchiveHost`, not inside its awaits.
- **Fix:** `runNearbySyncThenHostCycle` with generation/owner — stop → sync → host; cleanup bumps gen + immediate stopHost; `reconcileNearbyArchiveHost({ isCurrent })` re-checks after awaits / before `startHost`; superseded after `startHost` tears down only when `hostRunningFor === null` (no newer owner).
- **Test:** `tests/nearby-sync-then-host-cycle.test.ts`
- **Area:** `hooks/useNearbyArchiveSync.ts`, `lib/online/nearby/nearby-archive-sync.ts`, `plugins/with-nearby-wifi-never-for-location.cjs`

### 2026-08 — Join→lobby sync-then-host race (queued maybeSync resolved early)

- **Symptom (review):** Lobby `await maybeSync` returned immediately when join sync was in-flight → `reconcileNearbyArchiveHost` started advertise while client still scanned UDP/BLE.
- **Cause:** Queued `maybeSync` callers did not await drain idle; play QR host was a separate effect.
- **Fix:** Personal waiters resolve only after drain idle; play sync+QR host in one sequenced effect; BLE soft reconcile (no teardown on presence flap); queue Want while serve busy; persist/gate `lanAllowed`.
- **Test:** `tests/nearby-archive-coordinator.test.ts` (C1 sync-then-host); `tests/nearby-ble-hybrid.test.ts` (queued Want).
- **Area:** `lib/online/nearby/nearby-archive-sync.ts`, `hooks/useNearbyArchiveSync.ts`, `ble-transport.ts`, `permission.ts`, `hybrid-transport.ts`

### 2026-08 — Nearby completion cooldown armed on empty discovery (I3/R1)

- **Symptom (review):** Locally complete + empty `fetchMissing` armed 45s cooldown → presence flap skipped rediscovery → trusted HaveAck delayed, lobby advertise lingered. Later: UDP-only Hello/`peerHaveRounds` also armed cooldown without TCP/BLE archivesEnd. Then: partial wire `archives.length > 0` without End still armed cooldown.
- **Cause:** `completionHandshakeSent/At` set after UDP announce whenever history was complete; then `peerHaveRounds.size > 0` / `archives.length > 0` treated contact/bytes as completion.
- **Fix:** Arm cooldown only when `result.trustedWireCompleted` (TCP/BLE `archivesEnd` → non-empty HaveAck). Empty, UDP-only, or partial archives without End do not cooldown.
- **Test:** `tests/nearby-archive-coordinator.test.ts` (empty + UDP-only + partial wire vs `trustedWireCompleted`).
- **Area:** `lib/online/nearby/nearby-archive-sync.ts`

### 2026-08 — Nearby cross-key sync parallel + BLE deferred Hello missed

- **Symptom (review):** (1) Rematch bump during in-flight sync started a second `fetchMissing` on the shared transport. (2) Central-2 subscribe during central-1 serve dropped Hello forever → BLE multi-peer hang.
- **Cause:** Single-flight keyed only by sync key; Hello skip without pending queue.
- **Fix:** Global single-flight + latest-input queue; pendingHello flush after serve release; BLE capability migration when storage key missing; tighter peer archive shape; presence-flap cooldown after completion handshake.
- **Test:** `tests/nearby-archive-coordinator.test.ts` (C1), `tests/nearby-ble-hybrid.test.ts` (C2), `tests/nearby-permission-lan-ble-split.test.ts` (I1), `tests/nearby-archive-review-fixes.test.ts` (I2).
- **Area:** `lib/online/nearby/nearby-archive-sync.ts`, `ble-transport.ts`, `permission.ts`, `strip-archive.ts`

### 2026-08 — Nearby BT deny blocked LAN + BLE TX crosstalk (hybrid restore)

- **Symptom (review):** (1) Android `requestMultiple` on LAN∪BLE + munim BT false → global nearby `denied` forever, blocking LAN on shared Wi‑Fi. (2) Shared GATT TX notify + overlapping Want async serves interleaved chunks across centrals.
- **Cause:** All-or-nothing permission union after hybrid restore; no TX mutex / single-flight on peripheral.
- **Fix:** Split LAN vs BLE capability evaluation; `granted` if either path OK; hybrid skips BLE when `bleAllowed=false`; BLE TX queue + single-flight Want; client ignores TX until own Want; lobby sync-then-host; os-pending promote only after import or matched local completion.
- **Test:** `tests/nearby-permission-lan-ble-split.test.ts`, `tests/nearby-ble-hybrid.test.ts` (B2 concurrent Want).
- **Area:** `lib/online/nearby/permission.ts`, `request-os-permissions.ts`, `android-nearby-permissions.ts`, `hybrid-transport.ts`, `ble-transport.ts`, `hooks/useNearbyArchiveSync.ts`

### 2026-08 — Nearby LAN→BLE GATT hybrid restored (munim-bluetooth)

- **Symptom / product:** Off-LAN peers (bus/cellular) could not gap-fill; prior BLE path was advertise-only or removed.
- **Fix:** Hybrid LAN then BLE GATT via `munim-bluetooth` + nitro; chunked framing; Store BT + Local Network; HaveAck `ble` trusted like TCP; host advertises both transports.
- **Test:** `tests/nearby-ble-gatt-framing.test.ts`, `tests/nearby-ble-hybrid.test.ts`; manual: same Wi‑Fi LAN + no shared LAN BLE.
- **Area:** `lib/online/nearby/ble-*.ts`, `hybrid-transport.ts`, `app.config.js`

### 2026-08 — Nearby UDP scan bind(0) missed hosts + BLE runtime on LAN-only Store

- **Symptom (review):** (1) Client `fetchMissing` bound UDP `bind(0)` while host announced to `NEARBY_UDP_PORT` → discovery empty on real devices (memory-transport tests green). (2) Hybrid still called BLE `startHost` without `NSBluetooth*` → iOS native abort risk; BLE transferred no archive bytes.
- **Fix:** Scan/host discovery bind = announce destination port + `reusePort`; host UDP bind fail closes advertise; hybrid LAN-only (deleted `ble-transport`, dropped `react-native-ble-advertiser` / `expo-network`); stop host when hook `enabled=false`; Android manifest without location/BT.
- **Test:** `tests/nearby-udp-discovery.test.ts`; manual smoke: 2 devices same Wi‑Fi, N>0, late join with gaps.
- **Area:** `lib/online/nearby/lan-transport.ts`, `hybrid-transport.ts`, `udp-discovery.ts`, `hooks/useNearbyArchiveSync.ts`, `app.config.js`

### 2026-08 — Nearby join→play syncInFlight swallow + multi-archive TCP line limit

- **Symptom (review):** (1) `maybeSyncNearbyArchives` same-key single-flight ignored play/lobby after join/browse fire-and-forget → one empty sync, no retry when peers appear. (2) Host wrote all Want archives in one TCP JSON line while `MAX_TCP_LINE_CHARS` ≈ one archive (~408k) → multi-round payloads could destroy the socket (worst-case / large archives; typical small games often fit).
- **Fix:** Queue latest same-key input and rerun after in-flight finishes; one archive per TCP line + `archivesEnd`; enforce `MAX_PEER_ARCHIVE_JSON_CHARS` on validate/serve; Android+iOS Store declarations LAN-only (no Bluetooth); remove dormant post-import finalize loop.
- **Test:** `tests/nearby-archive-coordinator.test.ts`, `tests/nearby-archive-tcp-framing.test.ts`
- **Area:** `lib/online/nearby/**`, `app.config.js`

### 2026-08 — Nearby partial-Want never stopped lobby advertise

- **Symptom (review):** Joiner with round 0 already Wanted only gaps `[1]` → HaveAck/`∩ served` = `[1]` → `isComplete(N=2)` false → lobby advertise forever; multi-host only the serving host saw TCP ack. BLE-only `isAvailable` + all-or-nothing BT permissions also blocked/misled production path.
- **Fix:** Want full capped `0..min(N,MAX)-1` (`expectedPriorRounds`); contact all discovered hosts; hybrid `isAvailable` = LAN only; LAN-only Android permissions; play sync without new OS prompt; no peer stats backfill in v1.
- **Test:** `tests/nearby-archive-advertise-stop.test.ts`, `tests/nearby-archive-wire-path.test.ts`
- **Area:** `lib/online/nearby/**`, `hooks/useNearbyArchiveSync.ts`

### 2026-08 — Nearby wire-path partial HaveAck / fetch race / Android 12 NEARBY_WIFI

- **Symptom (review / prevented):** (1) Client HaveAck echoed `wantRounds` → host marked peer complete after partial/invalid serve → early `stopNearbyArchiveHost`. (2) `fetchMissing` probe resolved while TCP IIFE still mutating → lost/unstable imports. (3) Android API 31–32 requested `NEARBY_WIFI_DEVICES` → permanent `denied`. (4) Host trusted claimed HaveAck beyond rounds served on that socket.
- **Fix:** `clientHaveAckRoundsFromReceived` / `hostTrustedHaveAckRounds` (∩ served); `createFetchMissingSettler` barrier; `androidNearbyLanPermissionList` gates API 33+; live `getHaveRounds`; UDP listener uses `hostHandlers`; memory ack = received only; fetch `bleTimeoutMs: 0`; `markNearbyArchiveSyncGrantedAfterSuccess` after import write **or** completion handshake that received archives already present locally. ADR-023 threat: hostile LAN roster-uid spoof residual.
- **Test:** `tests/nearby-archive-wire-path.test.ts`, `tests/nearby-archive-review-fixes.test.ts`
- **Area:** `lib/online/nearby/**`

### 2026-08 — Nearby peer import finalized empty+claimed stats / foreign archives / UDP HaveAck DoS

- **Symptom (review / prevented):** (1) Post-import `finalizeOnlineRoundForPlayer` without empty/claimed gate → zero competition stats + `wasOnlineRoundProcessed` forever (parity with legacy archive sync). (2) Any shape-valid TCP archive written regardless of `gameId` / requested gaps → foreign rooms pollute finished store. (3) Spoofed UDP HaveAck with roster uid → `isComplete` → `stopNearbyArchiveHost` for all hosts → late joiners miss gap-fill.
- **Cause:** Nearby path skipped sync-coordinator finalize gate; import had no expected-game filter; HaveAck trusted UDP broadcast.
- **Fix:** No peer-archive stats finalize in v1 (`applyPostImportEffects` only bumps history revision); `importPeerFinishedRoundArchive({ expectedGameId, allowedRounds })` + shared `importFinishedRoundArchiveIfAbsent`; PeerHaveRoundsMap trust (`tcp` trusted only after authorized Want on that socket / `udp` untrusted). `shouldTrustTcpHaveAck`.
- **Test:** `tests/nearby-archive-review-fixes.test.ts`, `tests/nearby-archive-permission.test.ts`
- **Area:** `lib/online/nearby/**`, `lib/online/session/online-session-archive.ts`

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

- **Symptom:** `subscribeSessionWordMaps` awaited auth with no timeout → hung Auth left results on \"Завантаження слів\" forever.
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
- **Cause:** Live session data overwriting the \"frozen\" view of non-opt-in players.
- **Fix:** ADR-022; keep frozen snapshot until explicit opt-in.
- **Area:** `lib/online/session/frozen-round-view.ts`

### 2026-06 — Organizer waiting room deleted on app background

- **Symptom:** Public lobby disappeared when organizer backgrounded the app.
- **Cause:** `abandon-gate` incorrectly triggered by AppState changes.
- **Fix:** Abandon waiting room only on explicit back navigation.
- **Area:** `lib/online/use-organizer-abandon-on-exit.ts`
