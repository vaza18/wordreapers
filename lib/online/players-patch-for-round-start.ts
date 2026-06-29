import type { GameSession, GameSessionPlayer } from '../firebase/types.js';

import { hasOptedIntoNextRound } from './live-round-membership.js';
import { playerForRoundStart } from './player-for-round-start.js';

export type RoundStartPlayerPatch = Pick<
  GameSessionPlayer,
  'score' | 'wordCount' | 'hasLeft' | 'online'
>;

/**
 * Reset per-player totals when a waiting lobby transitions to `playing`.
 * Lobby-present players (`online: true`) fully reset for the new round.
 * Offline opt-in players (`resultsExitedBy`) also clear stale `hasLeft`.
 * Other offline roster members only clear stale counters.
 */
export function playerPatchForRoundStart(
  session: GameSession,
  uid: string,
  player: GameSessionPlayer,
): RoundStartPlayerPatch | null {
  const optedIn = hasOptedIntoNextRound(session, uid);
  if (player.hasLeft === true && !optedIn) {
    return null;
  }
  if (player.online === true || optedIn) {
    const next = playerForRoundStart(player);
    return { score: next.score, wordCount: next.wordCount, hasLeft: next.hasLeft };
  }
  return { score: 0, wordCount: 0, online: false };
}

/** RTDB `players` multi-update before or with round start. */
export function buildPlayersPatchForRoundStart(
  session: GameSession,
): Record<string, RoundStartPlayerPatch> {
  const patch: Record<string, RoundStartPlayerPatch> = {};
  for (const [uid, player] of Object.entries(session.players)) {
    const next = playerPatchForRoundStart(session, uid, player);
    if (next) {
      patch[uid] = next;
    }
  }
  return patch;
}
