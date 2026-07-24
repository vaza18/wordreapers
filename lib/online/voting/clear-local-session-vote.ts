import type { GameSessionSnapshot } from '../../firebase/game-session-service.js';

export type LocalSessionVoteField = 'pauseVote' | 'earlyFinishVote' | 'addTimeVote' | 'resumeVote';

/** Optimistic clear of a vote field before RTDB cancel settles (avoids stuck proposer UI). */
export function clearLocalSessionVoteField(
  session: GameSessionSnapshot,
  field: LocalSessionVoteField,
): GameSessionSnapshot {
  return { ...session, [field]: null };
}
