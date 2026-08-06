import { isFinalRoomRound } from '../../constants/max-rounds-per-room.js';

export type ResultsRematchFooterMode = 'rematch' | 'room_complete';

export type ResultsRematchFooterModeInput = {
  /** Round index shown on results (frozen/archive or live finished). */
  displayBaseWordRound: number;
  liveStatus?: 'waiting' | 'playing' | 'finished' | null;
  liveBaseWordRound?: number | null;
};

/**
 * Footer CTA mode for online results.
 * Room-complete when the displayed round is final, or when live RTDB is already
 * finished on the final index (frozen earlier-round viewers must not see «Грати ще»).
 */
export function resultsRematchFooterMode(
  input: ResultsRematchFooterModeInput,
): ResultsRematchFooterMode {
  if (isFinalRoomRound(input.displayBaseWordRound)) {
    return 'room_complete';
  }
  if (input.liveStatus === 'finished' && isFinalRoomRound(input.liveBaseWordRound ?? 0)) {
    return 'room_complete';
  }
  return 'rematch';
}
