import { resolveGameSessionSettings } from '../../firebase/session-settings.js';
import type { GameSession, GameSessionPlayer } from '../../firebase/types.js';
import { currentBaseWordPickerUid } from '../base-word-picker.js';
import { assertRematchBootstrapSessionShape } from '../invariants.js';
import { rematchWaitingPlayerPatch } from '../presence/live-round-membership.js';
import { buildRematchOptInLatch } from './rematch-waiting-lobby.js';

/**
 * Build a clean RTDB document for rematch bootstrap (no finished-round word maps).
 * Presence matches live `rematchFinishedSessionToWaiting`: actor + prior exits → online.
 * Keeps a `resultsExitedBy` opt-in latch so brief offline does not drop the rematcher.
 */
export function buildRematchWaitingSession(source: GameSession, actorUid: string): GameSession {
  const players: Record<string, GameSessionPlayer> = {};
  for (const [uid, player] of Object.entries(source.players)) {
    players[uid] = {
      ...player,
      ...rematchWaitingPlayerPatch(source, uid, actorUid),
    };
  }

  if (!players[source.organizerId]) {
    // Archive missing organizer: only the rematch actor may resurrect as opted-in.
    players[source.organizerId] =
      actorUid === source.organizerId
        ? {
            name: 'Organizer',
            ...rematchWaitingPlayerPatch(source, source.organizerId, actorUid),
          }
        : {
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
    resultsExitedBy: buildRematchOptInLatch(actorUid, source.resultsExitedBy),
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
