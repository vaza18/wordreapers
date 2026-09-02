import { get, set } from 'firebase/database';

import { toScoredWordEntry, type ScoredWordEntry, type WordScoreKind } from '@/lib/game/scoring.js';
import type { SubmitWordProfile } from '@/lib/online/submit-word-profile.js';
import {
  wordPlayersPerWordRef,
  wordPlayersShardPlayerRef,
} from '@/lib/online/word-maps-shard-refs.js';

import { ensureAnonymousAuth } from './auth.js';
import { isFirebaseNetworkError, isFirebasePermissionDenied } from './rtdb-errors.js';
import { normalizeRoomCode } from './room-code.js';
import { recordRtdbUp, instrumentedSnapshotVal } from './rtdb-instrumentation.js';

export type SubmitWordError = 'NOT_PLAYING' | 'SESSION_MISSING' | 'NETWORK';

export type SubmitOnlineWordOptions = {
  profile?: SubmitWordProfile | null;
};

function playersOnWordFromVal(val: unknown): Record<string, boolean> {
  if (val == null || typeof val !== 'object') {
    return {};
  }
  const out: Record<string, boolean> = {};
  for (const [key, flag] of Object.entries(val as Record<string, unknown>)) {
    if (flag === true) {
      out[key] = true;
    }
  }
  return out;
}

type WordShardCommit =
  { ok: true; playersOnWord: Record<string, boolean> } | { ok: false; error: 'NOT_PLAYING' };

/**
 * First finder: parent `set` on empty word node (rules: `!data.exists()`).
 * Second+ / parent race: leaf `set(true)` (parent rewrite denied so peers cannot be wiped).
 *
 * FIX: 2026-08 — late-round words missing (sync lag) → parent/leaf `set` (no TX)
 * avoids multi-second retry storms and Metro `permission_denied` after `playing → finished`.
 */
async function commitWordPlayersShard(
  roomId: string,
  normalized: string,
  uid: string,
): Promise<WordShardCommit> {
  const parentRef = wordPlayersPerWordRef(roomId, normalized);
  const leafRef = wordPlayersShardPlayerRef(roomId, normalized, uid);

  try {
    const patch = { [uid]: true };
    recordRtdbUp(patch);
    await set(parentRef, patch);
    return { ok: true, playersOnWord: { [uid]: true } };
  } catch (error) {
    if (!isFirebasePermissionDenied(error)) {
      throw error;
    }
    // Parent denied (node already claimed, or not playing) — fall through to leaf.
  }

  try {
    recordRtdbUp(true);
    await set(leafRef, true);
  } catch (error) {
    if (isFirebasePermissionDenied(error)) {
      return { ok: false, error: 'NOT_PLAYING' };
    }
    throw error;
  }

  // Leaf is committed (append-only) — treat as success even if parent re-read fails.
  // Do not invent peer overlap (`assumeShared`); keep unique until maps listener confirms.
  try {
    const parentSnapshot = await get(parentRef);
    const val = instrumentedSnapshotVal(parentSnapshot);
    const playersOnWord = playersOnWordFromVal(val);
    const withSelf = playersOnWord[uid] ? playersOnWord : { ...playersOnWord, [uid]: true };
    return { ok: true, playersOnWord: withSelf };
  } catch {
    return { ok: true, playersOnWord: { [uid]: true } };
  }
}

/**
 * Persist an accepted word as a wordPlayers shard only.
 * Live scores / uniqueness UI are derived on clients from session_word_maps.
 * After a successful shard commit the client does **not** roll back the RTDB leaf
 * or compensatory local state if a later parent re-read fails (append-only while
 * playing; rollback helper removed).
 */
export async function submitOnlineWord(
  gameId: string,
  uid: string,
  normalized: string,
  uniqueBonusEnabled: boolean,
  options?: SubmitOnlineWordOptions,
): Promise<{ ok: true; entry: ScoredWordEntry } | { ok: false; error: SubmitWordError }> {
  const profile = options?.profile ?? null;
  try {
    await ensureAnonymousAuth();
    profile?.mark('auth');
    const roomId = normalizeRoomCode(gameId);

    const shardResult = await commitWordPlayersShard(roomId, normalized, uid);
    profile?.mark('wordPlayersShardWrite');
    if (!shardResult.ok) {
      return { ok: false, error: shardResult.error };
    }

    const globalCount = Object.values(shardResult.playersOnWord).filter(
      (onWord) => onWord === true,
    ).length;
    const kind: WordScoreKind = globalCount > 1 ? 'normal' : 'unique';
    const entry = toScoredWordEntry(normalized, kind, uniqueBonusEnabled, globalCount);
    profile?.mark('done');
    return { ok: true, entry };
  } catch (error) {
    if (__DEV__) {
      console.warn('submitOnlineWord', error);
    }
    if (isFirebasePermissionDenied(error)) {
      return { ok: false, error: 'NOT_PLAYING' };
    }
    if (isFirebaseNetworkError(error)) {
      return { ok: false, error: 'NETWORK' };
    }
    return { ok: false, error: 'SESSION_MISSING' };
  }
}
