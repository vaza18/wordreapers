import type { RematchRtdbPresence } from './orphan-game-session.js';

export type { RematchRtdbPresence };

/** Pure rematch routing used by `restartRematchOnlineRound`. */
export function planRematchAction(
  presence: RematchRtdbPresence,
): 'bootstrap' | 'join_waiting' | 'restart_finished' | 'failed' {
  if (presence === 'missing') {
    return 'bootstrap';
  }
  if (presence === 'waiting') {
    return 'join_waiting';
  }
  if (presence === 'finished') {
    return 'restart_finished';
  }
  return 'failed';
}
