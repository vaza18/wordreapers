import { toDisplayUpper } from '../dictionary/normalize.js';
import { formatRoomCodeDisplay } from '../firebase/format-room-code.js';
import { resolveGameSessionSettingsForSession } from '../firebase/session-settings.js';
import type { GameSession } from '../firebase/types.js';
import { formatResultsVisibleWordsCaption } from '../game/results-meta-labels.js';
import { resolveRoundTimerBudgetSeconds } from '../game/round-duration.js';

export type StandingsSheetDetailsInput = {
  gameId: string;
  session: Pick<
    GameSession,
    | 'baseWord'
    | 'baseWordRound'
    | 'wordPlayers'
    | 'settings'
    | 'players'
    | 'liveRoundPlayerUids'
    | 'identityMasked'
    | 'isPublic'
    | 'roundTimerBudgetSeconds'
  > & { status?: GameSession['status'] };
  maxPlayableWords: number | null;
};

export type StandingsSheetDetails = {
  roomCodeRaw: string;
  roomCodeDisplay: string;
  baseWordDisplay: string;
  /** 1-based round for UI (`baseWordRound + 1`). */
  round: number;
  distinctWordCount: number;
  /** Preformatted via formatResultsVisibleWordsCaption — never empty for count ≥ 0 */
  wordsCollectedCaption: string;
  /** Planned countdown including approved add-time (`roundTimerBudgetSeconds`). */
  durationMinutes: number;
  uniqueBonusEnabled: boolean;
};

/** Distinct normalized words in the room (= results `totalDistinctWords` for the same maps). */
export function countDistinctRoomWords(
  wordPlayers: GameSession['wordPlayers'] | undefined,
): number {
  return Object.keys(wordPlayers ?? {}).length;
}

export function buildStandingsSheetDetails(
  t: (key: string, options?: Record<string, unknown>) => string,
  input: StandingsSheetDetailsInput,
): StandingsSheetDetails {
  const roomCodeRaw = input.gameId.replace(/\s/g, '').toUpperCase();
  const distinctWordCount = countDistinctRoomWords(input.session.wordPlayers);
  const resolved = resolveGameSessionSettingsForSession(input.session);
  const wordsCollectedCaption =
    formatResultsVisibleWordsCaption(t, {
      visibleCount: distinctWordCount,
      maxPlayableWords: input.maxPlayableWords,
    }) ?? String(distinctWordCount);

  return {
    roomCodeRaw,
    roomCodeDisplay: formatRoomCodeDisplay(roomCodeRaw),
    baseWordDisplay: toDisplayUpper(input.session.baseWord ?? ''),
    /** 1-based human round (RTDB `baseWordRound` is 0-based). */
    round: (input.session.baseWordRound ?? 0) + 1,
    distinctWordCount,
    wordsCollectedCaption,
    durationMinutes: Math.round(resolveRoundTimerBudgetSeconds(input.session) / 60),
    uniqueBonusEnabled: resolved.uniqueBonusEnabled,
  };
}
