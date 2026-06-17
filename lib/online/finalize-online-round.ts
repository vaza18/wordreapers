import type { PlayerStandings } from '../game/scoring.js';
import { didPlayerWinOnlineRound } from '../profile/player-stats.js';
import { incrementCloudPlayerStatsIfRegistered } from '../firebase/user-stats-service.js';
import { usePlayerStatsStore } from '@/store/player-stats-store';

import { clearActiveRoundCacheForSession } from './cache-active-round.js';
import {
  markOnlineRoundProcessed,
  onlineRoundKey,
  wasOnlineRoundProcessed,
} from './processed-online-rounds.js';

/**
 * Record win/loss for this device once per online round (local + cloud if registered).
 */
export async function finalizeOnlineRoundForPlayer(
  gameId: string,
  baseWordRound: number,
  uid: string,
  standings: readonly PlayerStandings[],
): Promise<void> {
  const roundKey = onlineRoundKey(gameId, baseWordRound);
  if (await wasOnlineRoundProcessed(roundKey)) {
    return;
  }
  await markOnlineRoundProcessed(roundKey);

  const won = didPlayerWinOnlineRound(uid, standings);
  const wordsCollected = standings.find((row) => row.playerId === uid)?.wordCount ?? 0;
  await usePlayerStatsStore.getState().recordOnlineRound(won, wordsCollected);
  await incrementCloudPlayerStatsIfRegistered(won);
  await clearActiveRoundCacheForSession(gameId, baseWordRound);
}
