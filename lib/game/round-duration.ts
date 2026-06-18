import { resolveGameSessionSettings } from '../firebase/session-settings.js';
import type { GameSession } from '../firebase/types.js';
import { roundStartMsFromSession } from '../online/stale-player-words.js';

const MIN_WORDS_PER_MINUTE_DURATION_SECONDS = 60;

/** Word entry with submission timestamp for round duration estimation. */
export interface WordTimestampSource {
  at: number;
}

/** Collect all word submission timestamps from a per-player word map. */
export function collectWordTimestamps(
  byPlayer?: ReadonlyMap<string, ReadonlyMap<string, WordTimestampSource>>,
): number[] {
  const times: number[] = [];
  if (!byPlayer) {
    return times;
  }
  for (const words of byPlayer.values()) {
    for (const word of words.values()) {
      if (typeof word.at === 'number' && word.at > 0) {
        times.push(word.at);
      }
    }
  }
  return times;
}

/**
 * Approximate wall-clock round length from session settings and word timestamps.
 */
export function computeRoundDurationSeconds(
  session: GameSession,
  byPlayer?: ReadonlyMap<string, ReadonlyMap<string, WordTimestampSource>>,
  finishedAtMs?: number,
): number {
  const configured = resolveGameSessionSettings(session.settings).durationSeconds;
  const wordTimes = collectWordTimestamps(byPlayer);

  const endMs =
    finishedAtMs ??
    session.finishedAt ??
    (wordTimes.length > 0 ? Math.max(...wordTimes) : undefined);

  if (endMs == null) {
    return configured;
  }

  let startMs: number | null = null;
  if (session.timerEndsAt != null) {
    startMs = roundStartMsFromSession(session);
  }
  if (startMs == null && wordTimes.length > 0) {
    startMs = Math.min(...wordTimes);
  }
  if (startMs == null) {
    startMs = endMs - configured * 1000;
  }

  const elapsedSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
  if (elapsedSec === 0) {
    return configured;
  }
  return elapsedSec;
}

/** Human-readable round length for the results header (e.g. `10 хв`, `9:45`). */
export function formatRoundDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) {
    return `${mins} хв`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/** Minimum duration (seconds) used as WPM denominator for very short rounds. */
export function wordsPerMinuteDenominatorSeconds(durationSeconds: number): number {
  return Math.max(durationSeconds, MIN_WORDS_PER_MINUTE_DURATION_SECONDS);
}

/** Average words per minute for one player (one decimal). */
export function computeWordsPerMinute(wordCount: number, durationSeconds: number): number {
  if (durationSeconds <= 0 || wordCount <= 0) {
    return 0;
  }
  const minutes = wordsPerMinuteDenominatorSeconds(durationSeconds) / 60;
  return Math.round((wordCount / minutes) * 10) / 10;
}
