import { get } from 'firebase/database';

import { toScoredWordEntry, type ScoredWordEntry, type WordScoreKind } from '../game/scoring.js';
import type { SubmitWordProfile } from '../online/submit-word-profile.js';
import {
  wordPlayersPerWordRef,
  wordPlayersShardPlayerRef,
} from '../online/word-maps-shard-refs.js';

import { ensureAnonymousAuth } from './auth.js';
import { isFirebaseNetworkError, isFirebasePermissionDenied } from './rtdb-errors.js';
import { runRtdbTransaction } from './rtdb-transaction.js';
import { normalizeRoomCode } from './room-code.js';

export type SubmitWordError = 'NOT_PLAYING' | 'DUPLICATE' | 'SESSION_MISSING' | 'NETWORK';

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
  | { ok: true; playersOnWord: Record<string, boolean> }
  | { ok: false; error: 'DUPLICATE' | 'NOT_PLAYING' };

/**
 * First finder: parent TX on empty word node (rules: `!data.exists()`).
 * Second+: leaf TX (parent rewrite would allow peer wipe; rules forbid it).
 */
async function commitWordPlayersShard(
  roomId: string,
  normalized: string,
  uid: string,
): Promise<WordShardCommit> {
  const parentRef = wordPlayersPerWordRef(roomId, normalized);

  try {
    const parentTx = await runRtdbTransaction(parentRef, (current) => {
      const existing = playersOnWordFromVal(current);
      if (existing[uid] === true) {
        return undefined;
      }
      // Rules only allow parent write when the word node is empty.
      if (Object.keys(existing).length > 0) {
        return undefined;
      }
      return { [uid]: true };
    });
    if (parentTx.committed) {
      const playersOnWord = playersOnWordFromVal(parentTx.snapshot?.val());
      const withSelf = playersOnWord[uid] ? playersOnWord : { ...playersOnWord, [uid]: true };
      return { ok: true, playersOnWord: withSelf };
    }
    const afterParent = playersOnWordFromVal(parentTx.snapshot?.val());
    if (afterParent[uid] === true) {
      return { ok: false, error: 'DUPLICATE' };
    }
  } catch (error) {
    if (!isFirebasePermissionDenied(error)) {
      throw error;
    }
    // Parent denied (node already claimed by a peer) — fall through to leaf.
  }

  try {
    const leafTx = await runRtdbTransaction(
      wordPlayersShardPlayerRef(roomId, normalized, uid),
      (current) => {
        if (current === true) {
          return undefined;
        }
        return true;
      },
    );
    if (!leafTx.committed) {
      return { ok: false, error: 'DUPLICATE' };
    }
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
    const playersOnWord = playersOnWordFromVal(parentSnapshot.val());
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
    profile?.mark('wordPlayersShardTx');
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
