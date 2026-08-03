import { get, remove, set } from 'firebase/database';

import { ensureAnonymousAuth } from '../../firebase/auth.js';
import { joinGameSession, type GameSessionSnapshot } from '../../firebase/game-session-service.js';
import { sessionRef } from '../../firebase/session-ref.js';
import { getServerNow } from '../../firebase/server-clock.js';
import { normalizeRoomCode } from '../../firebase/room-code.js';
import { writeSessionWordMapsShards } from '../../firebase/session-word-maps-service.js';
import { sessionWordMapsFromSession } from '../../firebase/session-word-maps.js';
import type { GameSession } from '../../firebase/types.js';
import type { PlayerProfile } from '../../profile/player-profile.js';

import {
  canRestorePlayingRoundFromCache,
  findActiveRoundCacheForGame,
} from './active-round-cache.js';
import { isOrphanGameSessionShell } from '../orphan-game-session.js';
import type { PlayingRoundSnapshot } from './online-session-archive.js';
import { removeOrphanGameSessionShell } from '../../firebase/game-session-service.js';
import { wordPlayersForUidOnly } from '../word-players-invert.js';

async function readSessionSnapshot(gameId: string): Promise<GameSessionSnapshot> {
  const normalized = normalizeRoomCode(gameId);
  const snapshot = await get(sessionRef(normalized));
  if (!snapshot.exists()) {
    throw new Error('ROOM_NOT_FOUND');
  }
  return { id: normalized, ...(snapshot.val() as GameSession) };
}

function sessionCoreFromSnapshot(snap: PlayingRoundSnapshot): GameSession {
  return {
    baseWord: snap.baseWord,
    status: 'playing',
    settings: snap.settings,
    timerEndsAt: snap.timerEndsAt,
    roundStartedAt: snap.roundStartedAt,
    roundTimerBudgetSeconds: snap.roundTimerBudgetSeconds,
    organizerId: snap.organizerId,
    players: snap.players,
    pauseState: snap.pauseState,
    baseWordPickerOrder: snap.baseWordPickerOrder,
    baseWordRound: snap.baseWordRound,
  };
}

/**
 * Recreate a deleted `playing` session from this device's parked round cache.
 * Writes only the actor's wordPlayers leaves (peers restore their own shards).
 */
export async function restorePlayingSessionFromLocalCache(
  gameId: string,
  uid: string,
): Promise<GameSessionSnapshot> {
  const serverNow = getServerNow();
  const entry = await findActiveRoundCacheForGame(gameId, serverNow);
  if (!canRestorePlayingRoundFromCache(entry, serverNow)) {
    throw new Error('NO_RESTORABLE_LOCAL_CACHE');
  }

  const normalized = normalizeRoomCode(gameId);
  const existing = await get(sessionRef(normalized));
  if (existing.exists()) {
    const raw = existing.val();
    if (isOrphanGameSessionShell(raw)) {
      const removed = await removeOrphanGameSessionShell(normalized, uid);
      if (!removed) {
        throw new Error('NO_RESTORABLE_LOCAL_CACHE');
      }
    } else {
      const session = raw as GameSession;
      if (session.status === 'finished') {
        throw new Error('ROUND_ALREADY_FINISHED');
      }
      if (session.status !== 'playing') {
        throw new Error('ROOM_NOT_JOINABLE');
      }
    }
  }
  const afterOrphan = await get(sessionRef(normalized));
  if (!afterOrphan.exists()) {
    const core = sessionCoreFromSnapshot(entry.sessionSnapshot);
    const ownWordPlayers = wordPlayersForUidOnly(
      sessionWordMapsFromSession(entry.sessionSnapshot).wordPlayers,
      uid,
    );
    await set(sessionRef(normalized), core);
    try {
      if (Object.keys(ownWordPlayers).length > 0) {
        await writeSessionWordMapsShards(normalized, { wordPlayers: ownWordPlayers });
      }
    } catch (error) {
      // Do not leave a playing room with empty maps when cache had own words.
      try {
        await remove(sessionRef(normalized));
      } catch {
        // Best-effort rollback; rethrow the maps failure.
      }
      throw error;
    }
  }

  return readSessionSnapshot(normalized);
}

/**
 * Rejoin a round: use Firebase when the room exists, otherwise restore from local cache.
 */
export async function rejoinOnlineRound(
  gameId: string,
  profile: PlayerProfile,
): Promise<GameSessionSnapshot> {
  try {
    return await joinGameSession(gameId, profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== 'ROOM_NOT_FOUND') {
      throw error;
    }
  }

  const user = await ensureAnonymousAuth();
  await restorePlayingSessionFromLocalCache(gameId, user.uid);
  return joinGameSession(gameId, profile);
}
