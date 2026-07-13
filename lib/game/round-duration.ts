import i18n from '@/i18n';
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

/** Countdown budget in seconds (settings duration + approved add-time). */
export function resolveRoundTimerBudgetSeconds(session: GameSession): number {
  const configured = resolveGameSessionSettings(session.settings).durationSeconds;
  return typeof session.roundTimerBudgetSeconds === 'number'
    ? session.roundTimerBudgetSeconds
    : configured;
}

/** Remaining countdown ms at finish (respects pause freeze). */
export function remainingMsAtFinishMoment(session: GameSession, now: number): number {
  if (session.pauseState?.active) {
    return session.pauseState.frozenRemainingMs;
  }
  if (session.timerEndsAt != null) {
    return Math.max(0, session.timerEndsAt - now);
  }
  return 0;
}

/** Timer seconds consumed from budget and remaining countdown. */
export function computeRoundPlayedSecondsFromTimerState(params: {
  budgetSeconds: number;
  remainingMs: number;
}): number {
  const remainingSec = Math.ceil(params.remainingMs / 1000);
  return Math.max(0, params.budgetSeconds - remainingSec);
}

/** Snapshot timer/game seconds consumed before clearing `timerEndsAt` / `pauseState`. */
export function computeRoundPlayedSecondsAtFinish(session: GameSession, now: number): number {
  return computeRoundPlayedSecondsFromTimerState({
    budgetSeconds: resolveRoundTimerBudgetSeconds(session),
    remainingMs: remainingMsAtFinishMoment(session, now),
  });
}

/**
 * Round length shown in results/history: timer/game seconds (pauses excluded).
 * Falls back for legacy sessions without `roundPlayedSeconds`.
 */
export function computeRoundDurationSeconds(
  session: GameSession,
  byPlayer?: ReadonlyMap<string, ReadonlyMap<string, WordTimestampSource>>,
  finishedAtMs?: number,
): number {
  if (typeof session.roundPlayedSeconds === 'number') {
    return session.roundPlayedSeconds;
  }

  const configured = resolveGameSessionSettings(session.settings).durationSeconds;
  const wordTimes = collectWordTimestamps(byPlayer);

  const endMs =
    finishedAtMs ??
    session.finishedAt ??
    (wordTimes.length > 0 ? Math.max(...wordTimes) : undefined);

  if (endMs == null) {
    return configured;
  }

  const startMs = roundStartMsFromSession(session);
  if (startMs != null) {
    const elapsedSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
    return elapsedSec === 0 ? configured : elapsedSec;
  }

  if (wordTimes.length > 0) {
    const elapsedSec = Math.max(0, Math.floor((endMs - Math.min(...wordTimes)) / 1000));
    if (elapsedSec > 0) {
      return elapsedSec;
    }
  }

  return configured;
}

/** Human-readable round length for the results header (e.g. `10 хв`, `9:45`). */
export function formatRoundDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) {
    return i18n.t('game.durationMinutes', { count: mins });
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
