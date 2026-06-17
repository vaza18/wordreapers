import type { PlayerGender } from '../game/grammar.js';
import type { GameSession } from '../firebase/types.js';
import { baseWordPickerTurnNumber, currentBaseWordPickerUid } from './base-word-picker.js';

export type RematchToastEvent = {
  type: 'rematch_reopened';
  pickerName: string;
  pickerGender: PlayerGender;
  roundNumber: number;
};

function playerGender(session: GameSession, playerId: string): PlayerGender {
  const raw = session.players[playerId]?.gender;
  return raw === 'f' || raw === 'm' ? raw : null;
}

/**
 * Detect when a finished session reopens for rematch (status → waiting).
 */
export function detectRematchToastEvent(
  prev: GameSession | null,
  curr: GameSession | null,
): RematchToastEvent | null {
  if (!prev || !curr || prev.status !== 'finished' || curr.status !== 'waiting') {
    return null;
  }

  const pickerUid = currentBaseWordPickerUid(curr);
  const picker = curr.players[pickerUid];

  return {
    type: 'rematch_reopened',
    pickerName: picker?.name ?? pickerUid,
    pickerGender: playerGender(curr, pickerUid),
    roundNumber: baseWordPickerTurnNumber(curr),
  };
}
