import { resolveGameSessionSettings } from '../../firebase/session-settings.js';
import type { GameSession, GameSessionPlayer } from '../../firebase/types.js';
import { currentBaseWordPickerUid } from '../base-word-picker.js';
import { assertRematchBootstrapSessionShape } from '../invariants.js';

/** Build a clean RTDB document for rematch bootstrap (no finished-round coordination fields). */
export function buildRematchWaitingSession(source: GameSession): GameSession {
  const players: Record<string, GameSessionPlayer> = {};
  for (const [uid, player] of Object.entries(source.players)) {
    players[uid] = { ...player, score: 0, wordCount: 0 };
  }

  if (!players[source.organizerId]) {
    players[source.organizerId] = {
      name: 'Organizer',
      wordCount: 0,
      score: 0,
      online: false,
      hasLeft: true,
    };
  }

  const baseWordPickerOrder =
    source.baseWordPickerOrder && source.baseWordPickerOrder.length > 0
      ? [...source.baseWordPickerOrder]
      : [source.organizerId];

  const session: GameSession = {
    baseWord: '',
    baseWordChosenBy: null,
    status: 'waiting',
    settings: resolveGameSessionSettings(source.settings, Object.keys(source.players).length),
    timerEndsAt: null,
    organizerId: source.organizerId,
    createdAt: Date.now(),
    baseWordRound: (source.baseWordRound ?? 0) + 1,
    players,
    baseWordPickerOrder,
    earlyFinishVote: null,
    pauseVote: null,
    pauseState: null,
    resumeVote: null,
  };

  const waitingSession = {
    ...session,
    baseWordPickerUid: currentBaseWordPickerUid(session),
  };
  assertRematchBootstrapSessionShape(waitingSession);
  return waitingSession;
}
