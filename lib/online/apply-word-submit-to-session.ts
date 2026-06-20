import { toScoredWordEntry, type ScoredWordEntry, type WordScoreKind } from '@/lib/game/scoring';
import type { GameSession } from '@/lib/firebase/types';

export type ApplyWordSubmitError = 'NOT_PLAYING' | 'DUPLICATE';

export type ApplyWordSubmitResult =
  | { ok: true; session: GameSession; entry: ScoredWordEntry }
  | { ok: false; error: ApplyWordSubmitError };

/**
 * Apply one accepted word to session maps and player score (RTDB transaction body).
 */
export function applyWordSubmitToSession(
  session: GameSession,
  uid: string,
  normalized: string,
  uniqueBonusEnabled: boolean,
): ApplyWordSubmitResult {
  if (session.status !== 'playing') {
    return { ok: false, error: 'NOT_PLAYING' };
  }
  const player = session.players[uid];
  if (!player) {
    return { ok: false, error: 'NOT_PLAYING' };
  }
  if (session.wordPlayers?.[normalized]?.[uid]) {
    return { ok: false, error: 'DUPLICATE' };
  }

  const wordCounts = { ...(session.wordCounts ?? {}) };
  const wordFirst = { ...(session.wordFirst ?? {}) };
  const wordPlayers = { ...(session.wordPlayers ?? {}) };
  const prevGlobal = wordCounts[normalized] ?? 0;
  wordCounts[normalized] = prevGlobal + 1;
  const globalCount = prevGlobal + 1;

  const playersOnWord = { ...(wordPlayers[normalized] ?? {}) };
  playersOnWord[uid] = true;
  wordPlayers[normalized] = playersOnWord;

  const kind: WordScoreKind = globalCount > 1 ? 'normal' : 'unique';

  if (prevGlobal === 0) {
    wordFirst[normalized] = uid;
  } else if (uniqueBonusEnabled) {
    const firstUid = wordFirst[normalized];
    if (firstUid && firstUid !== uid) {
      const firstPlayer = session.players[firstUid];
      if (firstPlayer) {
        firstPlayer.score = Math.max(0, (firstPlayer.score ?? 0) - 1);
      }
    }
  }

  session.wordCounts = wordCounts;
  session.wordFirst = wordFirst;
  session.wordPlayers = wordPlayers;

  const entry = toScoredWordEntry(normalized, kind, uniqueBonusEnabled, globalCount);
  player.score = (player.score ?? 0) + entry.points;
  player.wordCount = (player.wordCount ?? 0) + 1;
  player.online = true;
  session.players = { ...session.players, [uid]: player };

  return { ok: true, session, entry };
}
