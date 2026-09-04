import {
  get,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  ref,
  remove,
  update,
  type DatabaseReference,
  type Unsubscribe,
} from 'firebase/database';

import { getFirebaseDatabase } from './init.js';
import { ensureAnonymousAuth, getFirebaseUid } from './auth.js';
import { isFirebasePermissionDenied } from './rtdb-errors.js';
import { sessionWordMapsPath, sessionWordPlayersPath } from './paths.js';
import { normalizeRoomCode } from './room-code.js';
import {
  applyWordPlayersChildSnapshot,
  EMPTY_SESSION_WORD_MAPS,
  removeWordPlayersChild,
  type SessionWordMaps,
} from './session-word-maps.js';
import { liveWordMapsSignature } from '@/lib/online/session/live-words-snapshot.js';
import { devLogAction } from '@/lib/debug/dev-log.js';
import { rtdbTrafficProbe } from '@/lib/debug/rtdb-traffic-probe.js';
import {
  recordRtdbUpdate,
  recordRtdbRemove,
  instrumentedSnapshotVal,
  instrumentedChildSnapshotVal,
} from './rtdb-instrumentation.js';

function sessionWordMapsRef(gameId: string): DatabaseReference {
  return ref(getFirebaseDatabase(), sessionWordMapsPath(gameId));
}

function sessionWordPlayersRef(gameId: string): DatabaseReference {
  return ref(getFirebaseDatabase(), sessionWordPlayersPath(gameId));
}

type WordPlayersMap = NonNullable<SessionWordMaps['wordPlayers']>;

/** Build SessionWordMaps from a wordPlayers node snapshot value (single pass). */
function mapsFromWordPlayersNode(raw: unknown): SessionWordMaps {
  if (raw == null || typeof raw !== 'object') {
    return { ...EMPTY_SESSION_WORD_MAPS };
  }
  const wordPlayers: WordPlayersMap = {};
  for (const [normalized, players] of Object.entries(raw as Record<string, unknown>)) {
    const next = applyWordPlayersChildSnapshot({}, normalized, players);
    const parsed = next[normalized];
    // Skip ghost keys (`{}` / only false leaves → apply removes the word).
    if (parsed != null && Object.keys(parsed).length > 0) {
      wordPlayers[normalized] = parsed;
    }
  }
  return { wordPlayers };
}

type BufferedChildOp =
  { kind: 'upsert'; key: string; val: unknown } | { kind: 'remove'; key: string };

function applyBufferedOp(wordPlayers: WordPlayersMap, op: BufferedChildOp): WordPlayersMap {
  if (op.kind === 'remove') {
    return removeWordPlayersChild(wordPlayers, op.key);
  }
  return applyWordPlayersChildSnapshot(wordPlayers, op.key, op.val);
}

/** Uids newly set to true on a word (for observed post-seed action logs). */
export function newlyClaimedWordPlayerUids(
  prev: Record<string, boolean> | undefined,
  next: Record<string, boolean> | undefined,
): string[] {
  const claimed: string[] = [];
  for (const [uid, onWord] of Object.entries(next ?? {})) {
    if (onWord === true && prev?.[uid] !== true) {
      claimed.push(uid);
    }
  }
  return claimed;
}

/**
 * Last op wins per word key so a hung seed cannot grow memory with O(events).
 * Exported for unit tests.
 */
export function coalesceWordPlayersChildBuffer(
  ops: ReadonlyArray<BufferedChildOp>,
): BufferedChildOp[] {
  const byKey = new Map<string, BufferedChildOp>();
  for (const op of ops) {
    byKey.set(op.key, op);
  }
  return [...byKey.values()];
}

function pushCoalescedBufferOp(
  bufferByKey: Map<string, BufferedChildOp>,
  op: BufferedChildOp,
): void {
  bufferByKey.set(op.key, op);
}

/** Discriminated one-shot read — errors are not coerced to empty maps. */
export type SessionWordMapsFetchResult =
  { ok: true; maps: SessionWordMaps } | { ok: false; error: unknown };

export async function tryFetchSessionWordMaps(gameId: string): Promise<SessionWordMapsFetchResult> {
  const roomId = normalizeRoomCode(gameId);
  try {
    await ensureAnonymousAuth();
    // Same RTDB node as live listen seed get (wordPlayers) — avoid parent/child cache skew.
    const snapshot = await get(sessionWordPlayersRef(roomId));
    const val = instrumentedSnapshotVal(snapshot, sessionWordPlayersPath(roomId));
    if (!snapshot.exists()) {
      return { ok: true, maps: { ...EMPTY_SESSION_WORD_MAPS } };
    }
    return { ok: true, maps: mapsFromWordPlayersNode(val) };
  } catch (error) {
    return { ok: false, error };
  }
}

/** One-shot read that throws on network/permission failure (never coerces to empty). */
export async function requireSessionWordMaps(gameId: string): Promise<SessionWordMaps> {
  const result = await tryFetchSessionWordMaps(gameId);
  if (!result.ok) {
    throw result.error instanceof Error
      ? result.error
      : new Error(String(result.error) || 'session word maps fetch failed');
  }
  return result.maps;
}

/** Live maps event: provisional (UI-only) vs authoritative seed/live vs unavailability. */
export type SessionWordMapsListenEvent =
  | { type: 'snapshot'; maps: SessionWordMaps; seed: 'provisional' | 'authoritative' }
  | { type: 'unavailable'; reason: 'permission_denied' | 'error' };

function emitUnavailable(
  listener: (event: SessionWordMapsListenEvent) => void,
  roomId: string,
  error: unknown,
): void {
  if (isFirebasePermissionDenied(error)) {
    listener({ type: 'unavailable', reason: 'permission_denied' });
    return;
  }
  devLogAction('subscribeSessionWordMaps failed', {
    level: 'detail',
    room: roomId,
    details: error instanceof Error ? error.message : String(error),
  });
  listener({ type: 'unavailable', reason: 'error' });
}

/** Coalesce the initial onChildAdded wave into one provisional snapshot while get is in flight. */
export const WORD_MAPS_PROVISIONAL_SEED_MS = 16;

/**
 * Soft hung-get timeout interval (ms) while one seed `get` is in flight.
 *
 * Soft ticks are a **hang detector only** — they do **not** start a new Firebase get
 * and do **not** increment `seedAttempt`. After
 * {@link WORD_MAPS_SEED_SOFT_TIMEOUT_MAX_TICKS_DEFAULT} / caller `seedGetMaxAttempts`
 * ticks on the **same** getId → `abandonSeedRetries`. Soft-timeout must **not** abandon
 * early because `seedAttempt` already equals max (last real get still gets the full
 * soft-tick budget for late-seal). Until the soft-tick cap, a slow settle still seals.
 * Never start a parallel get on soft-timeout (late-seal).
 */
export const WORD_MAPS_SEED_GET_TIMEOUT_MS = 8_000;

/**
 * Hung {@link ensureAnonymousAuth} / App Check before attach: fail-loud `unavailable`
 * so results/left/play get Retry CTA (not infinite words-loading without mapsUnavailable).
 * Does **not** attach children without auth (P0 cold-open PD). Cancel during wait still
 * emits nothing. Late auth after this timeout must not attach.
 */
export const WORD_MAPS_AUTH_TIMEOUT_MS = 15_000;

export const WORD_MAPS_AUTH_TIMEOUT_ERROR = 'SESSION_WORD_MAPS_AUTH_TIMEOUT';

/**
 * First-step delay before the next **real** seed get after a settled hard fail.
 * Soft-timeout never schedules this delay — hang ticks only re-arm / abandon.
 * (`seedRetryQueued` is only for a rare `startSeedGet` while `seedGetInFlight`.)
 */
export const WORD_MAPS_SEED_GET_RETRY_MS = 400;

/** Cap for seed-get retry backoff (~≤7.5 get/min/client while retrying). */
export const WORD_MAPS_SEED_GET_RETRY_MAX_MS = 8_000;

/**
 * Default max **real** seed `get` starts (`startSeedGet` increments `seedAttempt`).
 * Soft-timeout ticks do **not** count — see {@link WORD_MAPS_SEED_SOFT_TIMEOUT_MAX_TICKS_DEFAULT}.
 * Hung path with override N: still **1** get until abandon after N soft ticks.
 */
export const WORD_MAPS_SEED_GET_MAX_ATTEMPTS = 8;

/**
 * Default max soft-timeout re-arms on **one** in-flight get before abandon.
 * When callers pass `seedGetMaxAttempts: N`, that N is used for **both** this soft-tick
 * cap **and** max real gets — but a forever-hung get#1 abandons after N ticks with
 * `get` call count still 1 (extra real gets only after hard-fail settle).
 */
export const WORD_MAPS_SEED_SOFT_TIMEOUT_MAX_TICKS_DEFAULT = WORD_MAPS_SEED_GET_MAX_ATTEMPTS;

/**
 * Results roster `seedGetMaxAttempts` override (also play uses 3).
 * Hung seed SLA ≈ N × {@link WORD_MAPS_SEED_GET_TIMEOUT_MS} to first `unavailable`
 * for get#1 forever-hang — **not** N sequential gets. Accepted product trade-off
 * (late-seal > eager supersede). See ADR-022 / known-issues soft-timeout SLA.
 */
export const ROSTER_WORD_MAPS_SEED_GET_MAX_ATTEMPTS = 3;

export const WORD_MAPS_SEED_TIMEOUT_ERROR = 'SESSION_WORD_MAPS_SEED_TIMEOUT';

/** Delay after a finished seed attempt before the next get (1-based attempt number). */
export function wordMapsSeedRetryDelayMs(attemptJustFinished: number): number {
  const shift = Math.max(0, attemptJustFinished - 1);
  return Math.min(WORD_MAPS_SEED_GET_RETRY_MAX_MS, WORD_MAPS_SEED_GET_RETRY_MS * 2 ** shift);
}

export type SubscribeSessionWordMapsOptions = {
  /**
   * Dual budget (default {@link WORD_MAPS_SEED_GET_MAX_ATTEMPTS}):
   * - **maxRealGets** — how many times `startSeedGet` may run (hard-fail retries).
   * - **maxSoftTicksPerGet** — soft-timeout hang detector on one in-flight get.
   *
   * Forever-hung get#1: abandon after `seedGetMaxAttempts` soft ticks; **get() is
   * called once** until abandon. Do **not** “fix” by starting parallel gets on
   * soft-timeout — that regresses late-seal.
   */
  seedGetMaxAttempts?: number;
  /**
   * Local player uid — post-seed word claims for this uid are not logged as
   * observed (local submit already logs via `submitOnlineWord`).
   * When omitted, falls back to {@link getFirebaseUid}.
   */
  localUid?: string | null;
};

/**
 * Live word maps: await {@link ensureAnonymousAuth} first (cold open / App Check),
 * then attach onChild* + get seed (no wipe race). Buffer until get reconciles.
 * After max-attempt abandon or PD: teardown children and emit `unavailable`
 * (consumer must resubscribe — play/roster listen epoch).
 * Firebase child `onCancel` also tears down once and emits `unavailable`; consumer
 * unsubscribe() does not emit. Cancel while auth is pending does **not** emit.
 * Hung auth (no resolve/reject) after {@link WORD_MAPS_AUTH_TIMEOUT_MS} emits
 * `unavailable` without attach; late auth must not attach.
 *
 * FIX: 2026-08 — Hung ensureAnonymousAuth (ADR-022) → fail-loud `unavailable`
 * after auth timeout so Retry CTA can show.
 */
export function subscribeSessionWordMaps(
  gameId: string,
  listener: (event: SessionWordMapsListenEvent) => void,
  options?: SubscribeSessionWordMapsOptions,
): Unsubscribe {
  const roomId = normalizeRoomCode(gameId);
  // Intentional double-call (with subscribeGameSession) is guarded by early-return
  // in setActiveRoomId. Both must ensure the probe tracks this room before data arrives.
  rtdbTrafficProbe.setActiveRoomId(roomId);
  let cancelled = false;
  let authTimedOut = false;
  let detach: Unsubscribe | null = null;
  let authTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    authTimer = null;
    if (cancelled || detach != null || authTimedOut) {
      return;
    }
    authTimedOut = true;
    emitUnavailable(listener, roomId, new Error(WORD_MAPS_AUTH_TIMEOUT_ERROR));
  }, WORD_MAPS_AUTH_TIMEOUT_MS);

  const clearAuthTimer = (): void => {
    if (authTimer != null) {
      clearTimeout(authTimer);
      authTimer = null;
    }
  };

  void ensureAnonymousAuth().then(
    () => {
      clearAuthTimer();
      if (cancelled || authTimedOut) {
        return;
      }
      detach = attachSessionWordMapsListen(roomId, listener, options);
    },
    (error: unknown) => {
      clearAuthTimer();
      if (cancelled || authTimedOut) {
        return;
      }
      emitUnavailable(listener, roomId, error);
    },
  );

  return () => {
    cancelled = true;
    clearAuthTimer();
    detach?.();
    detach = null;
  };
}

// FIX: 2026-08 — listen-first + seed buffer (ADR-022) → avoids rematch wipe Nibble/Race.
/** Attach children + seed get. Call only after auth is ready. */
function attachSessionWordMapsListen(
  roomId: string,
  listener: (event: SessionWordMapsListenEvent) => void,
  options?: SubscribeSessionWordMapsOptions,
): Unsubscribe {
  const maxSeedAttempts = options?.seedGetMaxAttempts ?? WORD_MAPS_SEED_GET_MAX_ATTEMPTS;
  const localUid = options?.localUid !== undefined ? options.localUid : getFirebaseUid();
  const playersRef = sessionWordPlayersRef(roomId);
  let wordPlayers: WordPlayersMap = {};
  let cancelled = false;
  let seeded = false;
  let seedAbandoned = false;
  let seedAttempt = 0;
  /** Bumped when a new seed get starts (lazy supersede of prior in-flight get). */
  let activeGetId = 0;
  /** Single-flight: at most one Firebase get at a time (no parallel hung gets). */
  let seedGetInFlight = false;
  /**
   * `startSeedGet` was requested while a get is still in flight (hard-fail retry
   * edge). Soft-timeout must **not** set this — hang ticks only re-arm / abandon.
   */
  let seedRetryQueued = false;
  const bufferByKey = new Map<string, BufferedChildOp>();
  const childUnsubs: Unsubscribe[] = [];
  let provisionalTimer: ReturnType<typeof setTimeout> | null = null;
  let seedTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const emitSnapshot = (seed: 'provisional' | 'authoritative') => {
    listener({
      type: 'snapshot',
      seed,
      maps: { wordPlayers: { ...wordPlayers } },
    });
  };

  const emitIfChanged = (next: WordPlayersMap, seed: 'provisional' | 'authoritative') => {
    if (liveWordMapsSignature({ wordPlayers }) === liveWordMapsSignature({ wordPlayers: next })) {
      return;
    }
    wordPlayers = next;
    emitSnapshot(seed);
  };

  const teardownChildren = () => {
    while (childUnsubs.length > 0) {
      const unsub = childUnsubs.pop();
      unsub?.();
    }
  };

  const clearProvisionalTimer = () => {
    if (provisionalTimer != null) {
      clearTimeout(provisionalTimer);
      provisionalTimer = null;
    }
  };

  const clearSeedTimer = () => {
    if (seedTimer != null) {
      clearTimeout(seedTimer);
      seedTimer = null;
    }
  };

  const clearRetryTimer = () => {
    if (retryTimer != null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const finishSeed = (base: WordPlayersMap) => {
    if (cancelled || seeded) {
      return;
    }
    seedRetryQueued = false;
    clearProvisionalTimer();
    clearSeedTimer();
    clearRetryTimer();
    let next = base;
    for (const op of bufferByKey.values()) {
      next = applyBufferedOp(next, op);
    }
    bufferByKey.clear();
    wordPlayers = next;
    seeded = true;
    seedAbandoned = false;
    emitSnapshot('authoritative');
  };

  const onCancel = (error: Error) => {
    if (cancelled) {
      return;
    }
    cancelled = true;
    seedRetryQueued = false;
    clearProvisionalTimer();
    clearSeedTimer();
    clearRetryTimer();
    teardownChildren();
    emitUnavailable(listener, roomId, error);
  };

  const emitProvisionalFromBuffer = () => {
    if (cancelled || seeded || seedAbandoned || bufferByKey.size === 0) {
      return;
    }
    let next: WordPlayersMap = {};
    for (const op of bufferByKey.values()) {
      next = applyBufferedOp(next, op);
    }
    emitIfChanged(next, 'provisional');
  };

  const scheduleProvisionalFromBuffer = () => {
    if (cancelled || seeded || seedAbandoned || provisionalTimer != null) {
      return;
    }
    provisionalTimer = setTimeout(() => {
      provisionalTimer = null;
      emitProvisionalFromBuffer();
    }, WORD_MAPS_PROVISIONAL_SEED_MS);
  };

  const handleChildOp = (op: BufferedChildOp) => {
    if (cancelled) {
      return;
    }
    if (!seeded) {
      // After seed abandon: no further buffer/provisional (I2) — wait for remount/CTA.
      if (seedAbandoned) {
        return;
      }
      // FIX: 2026-08 — get-buffer coalescing (ADR-022) → coalescence by word key (O(words)).
      // Buffer only — never seal authoritative seed from children alone.
      // Provisional UI may emit; bootstrap waits for get.
      pushCoalescedBufferOp(bufferByKey, op);
      scheduleProvisionalFromBuffer();
      return;
    }
    const prevPlayers = op.kind === 'upsert' ? wordPlayers[op.key] : undefined;
    const next = applyBufferedOp(wordPlayers, op);
    if (op.kind === 'upsert') {
      const nextPlayers = next[op.key];
      for (const uid of newlyClaimedWordPlayerUids(prevPlayers, nextPlayers)) {
        if (localUid != null && uid === localUid) {
          continue;
        }
        const players = Object.values(nextPlayers ?? {}).filter((on) => on === true).length;
        devLogAction(`submitted word "${op.key}"`, {
          observed: true,
          actor: uid,
          room: roomId,
          details: `players=${players}`,
        });
      }
    }
    emitIfChanged(next, 'authoritative');
  };

  const abandonSeedRetries = (error: unknown) => {
    if (cancelled || seeded || seedAbandoned) {
      return;
    }
    seedAbandoned = true;
    seedRetryQueued = false;
    // Clear single-flight so a remount can start fresh; late settle of this get
    // is ignored via seedAbandoned / bumped activeGetId (not via in-flight lock).
    seedGetInFlight = false;
    clearProvisionalTimer();
    clearSeedTimer();
    clearRetryTimer();
    bufferByKey.clear();
    activeGetId += 1;
    // Tear down children — avoid zombie listeners that ignore ops until remount (C2).
    teardownChildren();
    emitUnavailable(listener, roomId, error);
  };

  const scheduleSeedRetry = () => {
    if (cancelled || seeded || seedAbandoned) {
      return;
    }
    if (seedAttempt >= maxSeedAttempts) {
      abandonSeedRetries(new Error(WORD_MAPS_SEED_TIMEOUT_ERROR));
      return;
    }
    clearRetryTimer();
    const delay = wordMapsSeedRetryDelayMs(seedAttempt);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      startSeedGet();
    }, delay);
  };

  const flushQueuedSeedRetry = () => {
    if (!seedRetryQueued || cancelled || seeded || seedAbandoned) {
      return;
    }
    seedRetryQueued = false;
    scheduleSeedRetry();
  };

  const startSeedGet = () => {
    if (cancelled || seeded || seedAbandoned) {
      return;
    }
    // FIX: 2026-08 — single-flight seed get (ADR-022) → avoid parallel hung gets.
    // ── DO NOT (ADR-022 / late-seal) ─────────────────────────────────────────
    // - Do NOT start a parallel Firebase get on soft-timeout (eager supersede).
    // - Do NOT burn seedAttempt on soft-timeout ticks (hang detector only).
    // - Do NOT “fix” play ~72s CTA SLA by shortening budget here without product
    //   sign-off — see known-issues soft-timeout SLA + ADR-022.
    // Single-flight: at most one get open; queue via seedRetryQueued if needed.
    // ─────────────────────────────────────────────────────────────────────────
    if (seedGetInFlight) {
      seedRetryQueued = true;
      return;
    }
    seedGetInFlight = true;
    seedAttempt += 1;
    // Lazy supersede: bump only when starting the next get (not at soft-timeout).
    const getId = ++activeGetId;
    let softTimeoutTicks = 0;
    // Per-get soft-tick cap matches seedGetMaxAttempts so play/roster budgets stay aligned.
    const maxSoftTimeoutTicks = maxSeedAttempts;
    clearSeedTimer();

    const armHungSoftTimeout = () => {
      seedTimer = setTimeout(() => {
        if (cancelled || seeded || seedAbandoned || getId !== activeGetId) {
          return;
        }
        // FIX: 2026-08 — soft-timeout hang detector (ADR-022) → wait for late-seal.
        // Soft timeout without parallel get (single-flight). Same get may still seal
        // until we abandon. Do **not** increment seedAttempt (I1).
        softTimeoutTicks += 1;
        // Hang detector — not a new get attempt (seedAttempt unchanged; single-flight).
        devLogAction('subscribeSessionWordMaps seed get soft-timeout (hang tick)', {
          level: 'detail',
          room: roomId,
          details: `${WORD_MAPS_SEED_TIMEOUT_ERROR} tick=${softTimeoutTicks}/${maxSoftTimeoutTicks}`,
        });
        // Soft-timeout: hang detector only — re-arm timer; do **not** queue a get
        // (single-flight; late settle of this getId may still seal). Abandon only
        // after soft-tick cap — never because seedAttempt already hit max (last real
        // get must still get N soft ticks for late-seal). Real-get budget lives in
        // scheduleSeedRetry after hard-fail settle.
        if (softTimeoutTicks >= maxSoftTimeoutTicks) {
          abandonSeedRetries(new Error(WORD_MAPS_SEED_TIMEOUT_ERROR));
          return;
        }
        armHungSoftTimeout();
      }, WORD_MAPS_SEED_GET_TIMEOUT_MS);
    };
    armHungSoftTimeout();

    void get(playersRef).then(
      (snapshot) => {
        seedGetInFlight = false;
        if (cancelled || seeded || seedAbandoned || getId !== activeGetId) {
          flushQueuedSeedRetry();
          return;
        }
        const val = instrumentedSnapshotVal(snapshot, sessionWordPlayersPath(roomId));
        const base = snapshot.exists() ? (mapsFromWordPlayersNode(val).wordPlayers ?? {}) : {};
        finishSeed(base);
      },
      (error: unknown) => {
        seedGetInFlight = false;
        if (cancelled || seeded || seedAbandoned || getId !== activeGetId) {
          flushQueuedSeedRetry();
          return;
        }
        clearSeedTimer();
        // Permanent PD: never invent empty / never seal partial buffer as authoritative.
        // Same cleanup as max-attempt abandon (clearRetryTimer + bump activeGetId).
        if (isFirebasePermissionDenied(error)) {
          abandonSeedRetries(error);
          return;
        }
        // Retryable hard fail — do not emit unavailable while within retry budget.
        devLogAction('subscribeSessionWordMaps seed get failed; retrying', {
          level: 'detail',
          room: roomId,
          details: error instanceof Error ? error.message : String(error),
        });
        scheduleSeedRetry();
      },
    );
  };

  childUnsubs.push(
    onChildAdded(
      playersRef,
      (snap) => {
        if (snap.key == null) {
          return;
        }
        // FIX: 2026-09 — seed get + pre-seal children double-counted ↓ → skip child
        // instrumentation until after authoritative seed (ADR-025 / ADR-022 listen-first).
        const val = instrumentedChildSnapshotVal(seeded, snap);
        handleChildOp({ kind: 'upsert', key: snap.key, val });
      },
      onCancel,
    ),
    onChildChanged(
      playersRef,
      (snap) => {
        if (snap.key == null) {
          return;
        }
        const val = instrumentedChildSnapshotVal(seeded, snap);
        handleChildOp({ kind: 'upsert', key: snap.key, val });
      },
      onCancel,
    ),
    onChildRemoved(
      playersRef,
      (snap) => {
        if (snap.key == null) {
          return;
        }
        // After seed, RTDB still delivers the removed node snapshot — count once.
        if (seeded) {
          instrumentedSnapshotVal(snap);
        }
        handleChildOp({ kind: 'remove', key: snap.key });
      },
      onCancel,
    ),
  );

  startSeedGet();

  return () => {
    cancelled = true;
    clearSeedTimer();
    clearRetryTimer();
    clearProvisionalTimer();
    teardownChildren();
  };
}

/** Write per-word shards (RTDB rules deny bulk root writes on `session_word_maps`). */
export async function writeSessionWordMapsShards(
  gameId: string,
  maps: SessionWordMaps,
): Promise<void> {
  const roomId = normalizeRoomCode(gameId);
  const payload: Record<string, boolean> = {};
  for (const [normalized, playersOnWord] of Object.entries(maps.wordPlayers ?? {})) {
    for (const [uid, onWord] of Object.entries(playersOnWord)) {
      if (onWord) {
        payload[`wordPlayers/${normalized}/${uid}`] = true;
      }
    }
  }
  if (Object.keys(payload).length === 0) {
    return;
  }
  recordRtdbUpdate(payload);
  await update(sessionWordMapsRef(roomId), payload);
  devLogAction('restored session word maps', {
    room: roomId,
    details: `shards=${Object.keys(payload).length}`,
  });
}

/** Clear word maps on rematch / new round start. */
export async function clearSessionWordMaps(gameId: string): Promise<void> {
  const roomId = normalizeRoomCode(gameId);
  try {
    recordRtdbRemove(sessionWordMapsPath(roomId));
    await remove(sessionWordMapsRef(roomId));
    devLogAction('cleared session word maps', { room: roomId });
  } catch (error) {
    if (isFirebasePermissionDenied(error)) {
      return;
    }
    devLogAction('clearSessionWordMaps failed', {
      level: 'detail',
      room: roomId,
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Clear maps and verify empty before `waiting → playing`.
 * Fail-loud so play clients never latch `awaitingEmptySync` against uncleared prior-round words.
 */
export async function ensureSessionWordMapsEmptyForRoundStart(gameId: string): Promise<void> {
  const roomId = normalizeRoomCode(gameId);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await clearSessionWordMaps(roomId);
    const result = await tryFetchSessionWordMaps(roomId);
    if (!result.ok) {
      // Permission/network: cannot prove empty — fail start rather than enter polluted play.
      throw result.error instanceof Error
        ? result.error
        : new Error('SESSION_WORD_MAPS_CLEAR_UNVERIFIED');
    }
    if (Object.keys(result.maps.wordPlayers ?? {}).length === 0) {
      return;
    }
  }
  throw new Error('SESSION_WORD_MAPS_NOT_CLEARED');
}

export { sessionWordMapsRef };
