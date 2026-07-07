import { currentBaseWordPickerUid } from './base-word-picker.js';
import { waitingLobbyOptInUids } from './presence/live-round-membership.js';
import { buildPlayersPatchForRoundStart } from './presence/players-patch-for-round-start.js';
import { resolveGameSessionSettings } from '../firebase/session-settings.js';
import type { GameSession } from '../firebase/types.js';
import { gameSessionPath } from '../firebase/paths.js';

export type RoundStartWriteParams = {
  gameId: string;
  session: GameSession;
  actorUid: string;
  now: number;
  settings: ReturnType<typeof resolveGameSessionSettings>;
};

/** Build RTDB root multi-path update for `waiting → playing` (shared with rules tests). */
export function buildRoundStartWritePaths(params: RoundStartWriteParams): Record<string, unknown> {
  const { gameId, session, actorUid, now, settings } = params;
  const normalized = gameId.toUpperCase();
  const basePath = gameSessionPath(normalized);
  const pickerUid = currentBaseWordPickerUid(session);
  const endsAt = now + settings.durationSeconds * 1000;
  const playersPatch = buildPlayersPatchForRoundStart(session, actorUid);

  const multiPath: Record<string, unknown> = {};
  if (session.baseWordPickerUid !== pickerUid) {
    multiPath[`${basePath}/baseWordPickerUid`] = pickerUid;
  }

  const sessionStartPatch: Record<string, unknown> = {
    status: 'playing',
    timerEndsAt: endsAt,
    roundStartedAt: now,
    roundTimerBudgetSeconds: settings.durationSeconds,
    roundPlayedSeconds: null,
    settings,
    earlyFinishVote: null,
    pauseVote: null,
    resumeVote: null,
    pauseState: null,
    isPublic: false,
    publicPublishedAt: null,
    liveRoundPlayerUids: waitingLobbyOptInUids(session),
    resultsExitedBy: null,
  };

  for (const [key, value] of Object.entries(sessionStartPatch)) {
    multiPath[`${basePath}/${key}`] = value;
  }
  for (const [uid, patch] of Object.entries(playersPatch)) {
    for (const [field, value] of Object.entries(patch)) {
      multiPath[`${basePath}/players/${uid}/${field}`] = value;
    }
  }

  return multiPath;
}

export function resolveRoundStartSettings(
  session: GameSession,
): ReturnType<typeof resolveGameSessionSettings> {
  const playerCount =
    (session.baseWordRound ?? 0) > 0
      ? waitingLobbyOptInUids(session).length
      : Object.keys(session.players).length;
  return resolveGameSessionSettings(session.settings, playerCount);
}
