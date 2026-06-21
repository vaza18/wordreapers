import { ref } from 'firebase/database';

import { runRtdbTransaction } from './rtdb-transaction.js';

import { getFirebaseUid, isRegisteredFirebaseUser } from './auth.js';
import { getFirebaseDatabase } from './init.js';
import type { PlayerStats } from '../profile/player-stats.js';

const USER_STATS_PATH = 'user_stats';

function userStatsRef(uid: string) {
  return ref(getFirebaseDatabase(), `${USER_STATS_PATH}/${uid}`);
}

/**
 * Persist round outcome for signed-in (non-anonymous) accounts in RTDB.
 */
export async function incrementCloudPlayerStatsIfRegistered(won: boolean): Promise<void> {
  if (!isRegisteredFirebaseUser()) {
    return;
  }
  const uid = getFirebaseUid();
  if (!uid) {
    return;
  }

  await runRtdbTransaction(userStatsRef(uid), (current) => {
    const stats = (current as PlayerStats | null) ?? {
      gamesPlayed: 0,
      gamesWon: 0,
      wordsCollected: 0,
    };
    const gamesPlayed =
      typeof stats.gamesPlayed === 'number' && stats.gamesPlayed >= 0 ? stats.gamesPlayed : 0;
    const gamesWon = typeof stats.gamesWon === 'number' && stats.gamesWon >= 0 ? stats.gamesWon : 0;
    const wordsCollected =
      typeof stats.wordsCollected === 'number' && stats.wordsCollected >= 0
        ? stats.wordsCollected
        : 0;
    return {
      gamesPlayed: gamesPlayed + 1,
      gamesWon: gamesWon + (won ? 1 : 0),
      wordsCollected,
    } satisfies PlayerStats;
  });
}
