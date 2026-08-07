import type { GameSession } from '../../firebase/types.js';
import { normalizeRoomCode } from '../../firebase/room-code.js';
import { devLogAction } from '../../debug/dev-log.js';
import { filterMultiplayerArchivesForGame } from '../room-history-aggregate.js';
import {
  getFinishedRoundArchive,
  listFinishedRoundArchives,
  type FinishedRoundArchive,
} from '../session/online-session-archive.js';

import { createHybridNearbyTransport } from './hybrid-transport.js';
import { importPeerFinishedRoundArchive } from './import-peer-archive.js';
import {
  expectedPriorRounds,
  hasCompletePriorHistory,
  missingRoundArchives,
  normalizeHaveRounds,
} from './missing-round-archives.js';
import type { NearbyArchiveTransport } from './nearby-archive-transport.js';
import {
  ensureNearbyArchiveSyncAllowed,
  getNearbyArchiveSyncPermission,
  hydrateNearbyCapabilitiesFromStorage,
  isNearbyBleCapabilityAllowedSync,
  isNearbyBleCapabilityDeniedSync,
  markNearbyArchiveSyncGrantedAfterSuccess,
} from './permission.js';
import { peerHaveRoundsMap } from './peer-have-rounds.js';
import { applyPostImportEffects } from './post-import.js';
import { requestNearbyOsPermissions } from './request-os-permissions.js';
import { onlinePlayerUids, shouldAdvertiseForLobbyRoster } from './should-advertise-lobby.js';
import { stripArchiveForTransfer } from './strip-archive.js';
import { orderedSyncCandidateUids } from './sync-candidates.js';

/** LAN UDP/TCP discovery + fetch / completion-handshake budget. */
export const NEARBY_LAN_FETCH_TIMEOUT_MS = 10_000;
/** BLE GATT fallback budget after LAN (archives are slow over ATT). */
export const NEARBY_BLE_FETCH_TIMEOUT_MS = 25_000;

export type MaybeSyncNearbyArchivesInput = {
  gameId: string;
  selfUid: string;
  baseWordRound: number;
  session: GameSession;
  invitedByUid?: string | null;
  /**
   * When false, do not show a new OS permission prompt (play mid-round).
   * Sync runs only if already granted / os-pending.
   */
  allowOsPermissionPrompt?: boolean;
  /**
   * When true, may enter BLE phase even if capability is not yet confirmed (lobby/join probe).
   * Independent of {@link allowOsPermissionPrompt} — play must leave this false/omitted so
   * join→play coalesce cannot open BLE mid-round.
   */
  allowBleProbe?: boolean;
};

let transportOverride: NearbyArchiveTransport | null = null;
let sharedTransport: NearbyArchiveTransport | null = null;
let hostRunningFor: string | null = null;
/** Invalidated on stop / newer reconcile claim so in-flight startHost cannot clobber. */
let activeHostApplyToken: { active: boolean } | null = null;
/**
 * Latest input to run (coalesced). Drain is single-flight; every caller awaits a personal
 * waiter resolved only when the drain is idle — lobby sync-then-host stays ordered.
 */
let syncQueuedInput: MaybeSyncNearbyArchivesInput | null = null;
let syncRunning = false;
const syncWaiters: Array<() => void> = [];
/**
 * Live BLE-probe gate for the current drain wave. play(false) clears this even while
 * join/browse sync is already inside runNearbyArchiveSyncOnce / fetchMissing.
 * Reset when the drain goes idle so lobby can probe again.
 */
let bleProbeLiveAllowed = true;
/** Completion handshake already sent for gameId:round:uid — presence flaps skip re-discovery. */
const completionHandshakeSent = new Set<string>();
const COMPLETION_HANDSHAKE_COOLDOWN_MS = 45_000;
const completionHandshakeAt = new Map<string, number>();

function noteBleProbeLivePreference(allowBleProbe: boolean | undefined): void {
  if (allowBleProbe === true) {
    return;
  }
  bleProbeLiveAllowed = false;
}

function resetBleProbeLiveGate(): void {
  bleProbeLiveAllowed = true;
}

function isBlePhaseStillAllowedForSync(allowBleProbe: boolean | undefined): boolean {
  if (isNearbyBleCapabilityAllowedSync()) {
    return true;
  }
  if (isNearbyBleCapabilityDeniedSync()) {
    return false;
  }
  return allowBleProbe === true && bleProbeLiveAllowed;
}

function invalidateActiveHostApplyToken(): void {
  if (activeHostApplyToken) {
    activeHostApplyToken.active = false;
    activeHostApplyToken = null;
  }
}

function claimHostApplyToken(): { active: boolean } {
  invalidateActiveHostApplyToken();
  const token = { active: true };
  activeHostApplyToken = token;
  return token;
}

function nearbySyncKey(
  input: Pick<MaybeSyncNearbyArchivesInput, 'gameId' | 'baseWordRound' | 'selfUid'>,
): string {
  return `${normalizeRoomCode(input.gameId)}:${input.baseWordRound}:${input.selfUid}`;
}

function getTransport(): NearbyArchiveTransport {
  if (transportOverride) {
    return transportOverride;
  }
  if (!sharedTransport) {
    sharedTransport = createHybridNearbyTransport();
  }
  return sharedTransport;
}

/** Test seam */
export function setNearbyArchiveTransportForTests(transport: NearbyArchiveTransport | null): void {
  transportOverride = transport;
  sharedTransport = null;
  hostRunningFor = null;
  invalidateActiveHostApplyToken();
  syncQueuedInput = null;
  syncRunning = false;
  resetBleProbeLiveGate();
  const stranded = syncWaiters.splice(0);
  for (const resolve of stranded) {
    resolve();
  }
  completionHandshakeSent.clear();
  completionHandshakeAt.clear();
}

async function ensureNearbyArchiveSyncDrain(): Promise<void> {
  if (syncRunning) {
    return;
  }
  syncRunning = true;
  try {
    for (;;) {
      while (syncQueuedInput) {
        const current = syncQueuedInput;
        syncQueuedInput = null;
        try {
          await runNearbyArchiveSyncOnce(current);
        } catch (error) {
          devLogAction('nearby archive sync failed', {
            details: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (syncWaiters.length === 0) {
        break;
      }
      const batch = syncWaiters.splice(0);
      for (const resolve of batch) {
        resolve();
      }
      // Allow newly awakened callers to enqueue before we declare idle.
      await Promise.resolve();
      if (!syncQueuedInput && syncWaiters.length === 0) {
        break;
      }
    }
  } finally {
    syncRunning = false;
    if (syncQueuedInput || syncWaiters.length > 0) {
      void ensureNearbyArchiveSyncDrain();
    } else {
      resetBleProbeLiveGate();
    }
  }
}

/**
 * Client: LAN gap-fill + TCP completion HaveAck.
 * Always Wants capped priors 0..min(N, MAX_ROUNDS_PER_ROOM)-1 (not only local gaps) so host trusted ∩ served
 * can satisfy isComplete and stop lobby advertise (ADR-023).
 *
 * Global single-flight: concurrent calls coalesce to the latest input. Every caller
 * awaits until the drain is idle — lobby sync-then-host stays ordered.
 */
export async function maybeSyncNearbyArchives(input: MaybeSyncNearbyArchivesInput): Promise<void> {
  if (!input.selfUid || input.baseWordRound <= 0) {
    return;
  }
  // Suppress probe immediately — must affect in-flight join/browse, not only the queue.
  noteBleProbeLivePreference(input.allowBleProbe);
  if (syncQueuedInput) {
    const keepPrompt =
      (syncQueuedInput.allowOsPermissionPrompt ?? true) || (input.allowOsPermissionPrompt ?? true);
    // BLE probe must be explicit on every waiter — AND so play(false) blocks join(true) mid-play.
    const allowBleProbe = syncQueuedInput.allowBleProbe === true && input.allowBleProbe === true;
    syncQueuedInput = { ...input, allowOsPermissionPrompt: keepPrompt, allowBleProbe };
  } else {
    syncQueuedInput = input;
  }
  const done = new Promise<void>((resolve) => {
    syncWaiters.push(resolve);
  });
  void ensureNearbyArchiveSyncDrain();
  await done;
}

async function runNearbyArchiveSyncOnce(input: MaybeSyncNearbyArchivesInput): Promise<void> {
  const {
    gameId,
    selfUid,
    baseWordRound,
    session,
    invitedByUid,
    allowOsPermissionPrompt = true,
    allowBleProbe = false,
  } = input;

  const all = await listFinishedRoundArchives();
  const roomArchives = filterMultiplayerArchivesForGame(all, gameId);
  const gaps = missingRoundArchives(baseWordRound, roomArchives);
  const wantRounds = expectedPriorRounds(baseWordRound);
  if (wantRounds.length === 0) {
    return;
  }

  const syncKey = nearbySyncKey(input);
  const completeLocally = hasCompletePriorHistory(baseWordRound, roomArchives);
  if (completeLocally && gaps.length === 0) {
    const lastAt = completionHandshakeAt.get(syncKey);
    if (
      completionHandshakeSent.has(syncKey) &&
      lastAt != null &&
      Date.now() - lastAt < COMPLETION_HANDSHAKE_COOLDOWN_MS
    ) {
      // Presence flap: already contacted a peer for this N recently — skip rediscovery.
      return;
    }
  }

  if (!allowOsPermissionPrompt) {
    const status = await getNearbyArchiveSyncPermission();
    if (status !== 'granted' && status !== 'os-pending') {
      return;
    }
    // Cold start: hydrate LAN/BLE gates without prompting (play mid-round).
    await hydrateNearbyCapabilitiesFromStorage();
  } else {
    // LAN-only OS when probe is off / play suppressed — never mid-play Android BT dialog.
    const allowed = await ensureNearbyArchiveSyncAllowed(() =>
      requestNearbyOsPermissions({
        includeBle:
          allowBleProbe === true && bleProbeLiveAllowed && !isNearbyBleCapabilityDeniedSync(),
      }),
    );
    if (!allowed) {
      return;
    }
  }

  const transport = getTransport();
  if (!transport.isAvailable()) {
    return;
  }

  const onlineUids = onlinePlayerUids(session.players);
  const candidateUids = orderedSyncCandidateUids({
    selfUid,
    invitedByUid: invitedByUid ?? session.players[selfUid]?.invitedBy,
    onlineUids,
  });

  // BLE only when confirmed, or live probe still allowed (play(false) clears mid-flight).
  const bleTimeoutMs = isBlePhaseStillAllowedForSync(allowBleProbe)
    ? NEARBY_BLE_FETCH_TIMEOUT_MS
    : 0;

  const result = await transport.fetchMissing({
    gameId,
    selfUid,
    candidateUids,
    wantRounds,
    timeoutMs: NEARBY_LAN_FETCH_TIMEOUT_MS + bleTimeoutMs,
    lanTimeoutMs: NEARBY_LAN_FETCH_TIMEOUT_MS,
    bleTimeoutMs,
    byteGapRounds: gaps,
    seekCompletionAck: completeLocally && gaps.length === 0,
    isBlePhaseStillAllowed: () => isBlePhaseStillAllowedForSync(allowBleProbe),
    onPeerHello: (uid, haveRounds) => {
      peerHaveRoundsMap.setHaveRounds(gameId, uid, haveRounds, 'untrusted');
    },
  });

  for (const [uid, haveRounds] of result.peerHaveRounds) {
    peerHaveRoundsMap.setHaveRounds(gameId, uid, haveRounds, 'untrusted');
  }

  const allowedRounds = new Set(gaps);
  const imported: FinishedRoundArchive[] = [];
  for (const archive of result.archives) {
    const wrote = await importPeerFinishedRoundArchive(archive, {
      expectedGameId: gameId,
      allowedRounds,
    });
    if (wrote) {
      imported.push(archive);
    }
  }

  if (imported.length > 0) {
    await markNearbyArchiveSyncGrantedAfterSuccess();
    await applyPostImportEffects({ importedArchives: imported });
    devLogAction('nearby archives imported', {
      details: `gameId=${normalizeRoomCode(gameId)} count=${imported.length}`,
    });
  }

  const refreshed = filterMultiplayerArchivesForGame(await listFinishedRoundArchives(), gameId);
  if (imported.length === 0 && result.archives.length > 0) {
    // Promote os-pending only when peer delivered our gameId rounds we already hold
    // (completion handshake) — not for shape-valid garbage that import rejected.
    const expected = normalizeRoomCode(gameId);
    const matchedLocal = result.archives.some((archive) => {
      if (normalizeRoomCode(archive.gameId) !== expected) {
        return false;
      }
      return refreshed.some((local) => local.baseWordRound === archive.baseWordRound);
    });
    if (matchedLocal) {
      await markNearbyArchiveSyncGrantedAfterSuccess();
    }
  }

  if (hasCompletePriorHistory(baseWordRound, refreshed)) {
    const haveRounds = normalizeHaveRounds(refreshed.map((archive) => archive.baseWordRound));
    try {
      await transport.announceHaveAck?.(gameId, selfUid, haveRounds);
      // Arm presence-flap cooldown only after archivesEnd → non-empty HaveAck on
      // TCP/BLE (transport.trustedWireCompleted). UDP Hello / partial archives
      // without End must NOT cooldown — advertise-stop still needs a retry.
      if (result.trustedWireCompleted) {
        completionHandshakeSent.add(syncKey);
        completionHandshakeAt.set(syncKey, Date.now());
      }
    } catch {
      // UDP informational only
    }
  }
}

export type NearbyHostControllerInput = {
  gameId: string;
  selfUid: string;
  baseWordRound: number;
  session: GameSession;
  /** Lobby: use advertise heuristic. Play QR: force while open. */
  mode: 'lobby' | 'playQr';
  forceAdvertise?: boolean;
  /**
   * When false, abandon without raising/keeping host (effect generation superseded).
   * Checked after awaits and immediately before startHost.
   */
  isCurrent?: () => boolean;
};

/**
 * Start/stop nearby host advertise based on lobby heuristic or forced play QR.
 */
export async function reconcileNearbyArchiveHost(input: NearbyHostControllerInput): Promise<void> {
  const { gameId, selfUid, baseWordRound, session, forceAdvertise, isCurrent, mode } = input;
  const stillCurrent = () => isCurrent?.() !== false;
  const transport = getTransport();
  if (!selfUid || !transport.isAvailable()) {
    await stopNearbyArchiveHost();
    return;
  }

  if (baseWordRound <= 0) {
    await stopNearbyArchiveHost();
    return;
  }

  const all = await listFinishedRoundArchives();
  if (!stillCurrent()) {
    return;
  }
  const roomArchives = filterMultiplayerArchivesForGame(all, gameId);
  const priorCount = roomArchives.filter((archive) => archive.baseWordRound < baseWordRound).length;

  const onlineUids = onlinePlayerUids(session.players);
  const should =
    forceAdvertise === true ||
    shouldAdvertiseForLobbyRoster({
      baseWordRound,
      selfUid,
      onlineUids,
      localPriorArchiveCount: priorCount,
      peerHave: peerHaveRoundsMap,
      gameId,
    });

  if (!should) {
    await stopNearbyArchiveHost();
    return;
  }

  // playQr: LAN-only OS request — never munim/BT mid-round invite.
  const allowed = await ensureNearbyArchiveSyncAllowed(() =>
    requestNearbyOsPermissions({ includeBle: mode !== 'playQr' }),
  );
  if (!stillCurrent()) {
    return;
  }
  if (!allowed) {
    await stopNearbyArchiveHost();
    return;
  }

  const key = `${normalizeRoomCode(gameId)}:${selfUid}`;
  if (hostRunningFor !== key) {
    await stopNearbyArchiveHost();
  }
  if (!stillCurrent()) {
    return;
  }

  const applyToken = claimHostApplyToken();
  await transport.startHost({
    gameId,
    uid: selfUid,
    applyToken,
    // Lobby may probe BLE only while capability is still unknown (not denied/allowed).
    allowBleProbe:
      mode === 'lobby' && !isNearbyBleCapabilityAllowedSync() && !isNearbyBleCapabilityDeniedSync(),
    getHaveRounds: async () => {
      const liveAll = await listFinishedRoundArchives();
      const liveRoom = filterMultiplayerArchivesForGame(liveAll, gameId);
      return normalizeHaveRounds(
        liveRoom
          .filter((archive) => archive.baseWordRound < baseWordRound)
          .map((archive) => archive.baseWordRound),
      );
    },
    getRosterUids: () => Object.keys(session.players ?? {}),
    getArchivesForRounds: async (rounds) => {
      const out: FinishedRoundArchive[] = [];
      for (const round of rounds) {
        const archive = await getFinishedRoundArchive(gameId, round);
        if (archive) {
          out.push(stripArchiveForTransfer(archive));
        }
      }
      return out;
    },
    onHaveAck: (uid, haveRounds, source) => {
      peerHaveRoundsMap.setHaveRounds(
        gameId,
        uid,
        haveRounds,
        source === 'tcp' || source === 'ble' ? 'trusted' : 'untrusted',
      );
      if (forceAdvertise) {
        return;
      }
      const still = shouldAdvertiseForLobbyRoster({
        baseWordRound,
        selfUid,
        onlineUids: onlinePlayerUids(session.players),
        localPriorArchiveCount: priorCount,
        peerHave: peerHaveRoundsMap,
        gameId,
      });
      if (!still) {
        void stopNearbyArchiveHost();
      }
    },
  });
  if (!stillCurrent() || !applyToken.active) {
    // Superseded: tear down only if this token still owns (no newer claim).
    if (applyToken.active && activeHostApplyToken === applyToken) {
      await stopNearbyArchiveHost();
    }
    return;
  }
  hostRunningFor = key;
}

export async function stopNearbyArchiveHost(): Promise<void> {
  invalidateActiveHostApplyToken();
  hostRunningFor = null;
  try {
    await getTransport().stopHost();
  } catch {
    // silent
  }
}

export function clearNearbyPeerStateForGame(gameId: string): void {
  peerHaveRoundsMap.clearGame(gameId);
  const prefix = `${normalizeRoomCode(gameId)}:`;
  for (const key of [...completionHandshakeSent]) {
    if (key.startsWith(prefix)) {
      completionHandshakeSent.delete(key);
      completionHandshakeAt.delete(key);
    }
  }
}
