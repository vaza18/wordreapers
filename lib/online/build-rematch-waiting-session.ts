import { resolveGameSessionSettings } from '../firebase/session-settings.js';
import type { GameSession, GameSessionPlayer } from '../firebase/types.js';

/** Build a clean RTDB document for rematch bootstrap (no finished-round coordination fields). */
export function buildRematchWaitingSession(source: GameSession): GameSession {
  const players: Record<string, GameSessionPlayer> = {};
  for (const [uid, player] of Object.entries(source.players)) {
    players[uid] = { ...player, score: 0, wordCount: 0 };
  }

  const baseWordPickerOrder =
    source.baseWordPickerOrder && source.baseWordPickerOrder.length > 0
      ? [...source.baseWordPickerOrder]
      : [source.organizerId];

  return {
    baseWord: '',
    status: 'waiting',
    settings: resolveGameSessionSettings(source.settings, Object.keys(source.players).length),
    timerEndsAt: null,
    organizerId: source.organizerId,
    baseWordRound: (source.baseWordRound ?? 0) + 1,
    players,
    baseWordPickerOrder,
    earlyFinishVote: null,
    pauseVote: null,
    pauseState: null,
    resumeVote: null,
  };
}
