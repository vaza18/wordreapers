import type { StoredPlayerWord } from '../firebase/player-words-service.js';
import type { GameSession } from '../firebase/types.js';

import { buildLocalTimeUpSessionSnapshot } from './play-local-time-up.js';
import type { AllPlayerWords } from './session/clone-player-words.js';
import {
  getFinishedRoundArchive,
  saveFinishedRoundArchive,
} from './session/online-session-archive.js';

/**
 * Build a minimal archive word map after rematch when RTDB player_words may already
 * be cleared — keep the viewer's words; peers may be empty until history rebuild.
 */
export function buildPartialArchiveWordsForLocalTimeUp(
  playerIds: string[],
  myUid: string,
  myWords: Map<string, StoredPlayerWord>,
): AllPlayerWords {
  const words: AllPlayerWords = new Map();
  for (const playerId of playerIds) {
    if (playerId === myUid) {
      const mine = new Map<string, StoredPlayerWord>();
      for (const [normalized, word] of myWords) {
        mine.set(normalized, word);
      }
      words.set(playerId, mine);
    } else {
      words.set(playerId, new Map());
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
 * finished archive for the pinned round. Prefer an existing archive; otherwise
 * seed from a local synthetic finished snapshot (never fetch RTDB words after rematch).
 */
export async function ensureLocalArchiveForRematchAdvancedResults(options: {
  gameId: string;
  expectedBaseWordRound: number;
  localFinishedSession: GameSession | null | undefined;
  myUid: string;
  myWords: Map<string, StoredPlayerWord>;
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
  const words = buildPartialArchiveWordsForLocalTimeUp(
    Object.keys(finished.players),
    options.myUid,
    options.myWords,
  );
  await saveFinishedRoundArchive(options.gameId, finished, words);
  return true;
}
