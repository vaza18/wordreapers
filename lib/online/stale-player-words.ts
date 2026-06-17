import { resolveGameSessionSettings } from '../firebase/session-settings.js';
import type { GameSession } from '../firebase/types.js';

const ROUND_START_SKEW_MS = 5000;

/** Approximate start of the current playing round from timer + duration. */
export function roundStartMsFromSession(session: GameSession): number | null {
  if (session.timerEndsAt == null) {
    return null;
  }
  const settings = resolveGameSessionSettings(session.settings);
  return session.timerEndsAt - settings.durationSeconds * 1000;
}

/**
 * True when every stored word predates the current round window (rematch leftovers).
 */
export function wordsAreFromPreviousRound(
  session: GameSession,
  words: ReadonlyMap<string, { at: number }>,
): boolean {
  if (words.size === 0) {
    return false;
  }
  const roundStartMs = roundStartMsFromSession(session);
  if (roundStartMs == null) {
    return false;
  }
  const cutoff = roundStartMs - ROUND_START_SKEW_MS;
  return [...words.values()].every((word) => word.at < cutoff);
}
