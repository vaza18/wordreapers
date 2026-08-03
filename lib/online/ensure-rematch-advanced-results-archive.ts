import type { GameSession } from '../firebase/types.js';

import { buildLocalTimeUpSessionSnapshot } from './play-local-time-up.js';
import type { AllPlayerWords } from './session/clone-player-words.js';
import {
  getFinishedRoundArchive,
  saveFinishedRoundArchive,
} from './session/online-session-archive.js';

/**
 * Build a minimal archive word map for a solo finished seed (viewer only).
 * Multi-player partial peers must not be saved as a final archive — see
 * {@link ensureLocalArchiveForRematchAdvancedResults}.
 */
export function buildPartialArchiveWordsForLocalTimeUp(
  playerIds: string[],
  myUid: string,
  myWords: string[],
): AllPlayerWords {
  const words: AllPlayerWords = new Map();
  for (const playerId of playerIds) {
    if (playerId === myUid) {
      words.set(playerId, [...myWords]);
    } else {
      words.set(playerId, []);
    }
  }
  return words;
}

/**
 * Prefer an explicit local finished snapshot; otherwise coerce the live/pinned
 * session into a finished archive seed for the expected round.
 */
export function resolveLocalFinishedSessionForResultsArchive(options: {
  gameId: string;
  expectedBaseWordRound: number;
  localFinishedSession: GameSession | null | undefined;
  liveSession: GameSession | null | undefined;
}): GameSession | null {
  const pinned = options.localFinishedSession;
  if (pinned && (pinned.baseWordRound ?? 0) === options.expectedBaseWordRound) {
    if (pinned.status === 'finished') {
      return pinned;
    }
    return buildLocalTimeUpSessionSnapshot(
      { ...pinned, baseWordRound: options.expectedBaseWordRound },
      options.gameId,
    );
  }
  const live = options.liveSession;
  if (!live) {
    return null;
  }
  return buildLocalTimeUpSessionSnapshot(
    { ...live, baseWordRound: options.expectedBaseWordRound },
    options.gameId,
  );
}

/**
 * Before opening results on `rematch_advanced` / finish timeout, require a local
 * finished archive for the pinned round. Prefer an existing archive.
 *
 * Solo (single roster member): may seed viewer words locally.
 * Multi-player: never save empty peer lists as a final archive — return false
 * so play shows retry (full maps archive must exist from the finished window).
 */
export async function ensureLocalArchiveForRematchAdvancedResults(options: {
  gameId: string;
  expectedBaseWordRound: number;
  localFinishedSession: GameSession | null | undefined;
  myUid: string;
  myWords: string[];
}): Promise<boolean> {
  const existing = await getFinishedRoundArchive(options.gameId, options.expectedBaseWordRound);
  if (existing) {
    return true;
  }
  const session = options.localFinishedSession;
  if (!session) {
    return false;
  }
  if ((session.baseWordRound ?? 0) !== options.expectedBaseWordRound) {
    return false;
  }
  const finished =
    session.status === 'finished'
      ? session
      : buildLocalTimeUpSessionSnapshot(session, options.gameId);
  const playerIds = Object.keys(finished.players);
  const hasPeers = playerIds.some((id) => id !== options.myUid);
  if (hasPeers) {
    return false;
  }
  const words = buildPartialArchiveWordsForLocalTimeUp(playerIds, options.myUid, options.myWords);
  await saveFinishedRoundArchive(options.gameId, finished, words);
  return true;
}
