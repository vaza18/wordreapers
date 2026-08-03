import { sessionBaseWordDisplay } from './session-base-word-display.js';
import { resolvePlayerWordDisplay } from './player-word-display.js';
import { resolveGameSessionSettingsForSession } from '../firebase/session-settings.js';
import type { GameSession } from '../firebase/types.js';
import { createOnlineResultsDirectory } from '../game/results-directory.js';
import { formatResultsHeadline } from '../game/results-headline.js';
import { buildGlobalResultWords, buildPlayerResultRankGroups } from '../game/results-view.js';
import { computeRoundDurationSeconds } from '../game/round-duration.js';
import { buildLiveStandingsFromSession } from './live-standings.js';
import { isSoloStandings } from '../game/solo-round.js';
import type { PlayerStandings } from '../game/scoring.js';
import { wordPlayersFromWordsByPlayer } from './word-players-invert.js';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

type LexiconDisplays = ReadonlyMap<string, string> | Readonly<Record<string, string>> | undefined;

/** Parallel display labels for each player's normalized word list (lexicon first). */
export function buildDisplaysByPlayer(
  wordsByPlayer: ReadonlyMap<string, readonly string[]>,
  lexiconDisplays?: LexiconDisplays,
): Map<string, string[]> {
  const displaysByPlayer = new Map<string, string[]>();
  for (const [playerId, words] of wordsByPlayer) {
    displaysByPlayer.set(
      playerId,
      words.map((normalized) => resolvePlayerWordDisplay(normalized, lexiconDisplays)),
    );
  }
  return displaysByPlayer;
}

/**
 * Build the same results view model as local play from Firebase session + words.
 * Missing display rows fall back to uppercase normalized in `results-view`.
 * Standings always derive from `wordsByPlayer` (never RTDB players.score).
 */
export function buildOnlineResultsView(
  t: TranslateFn,
  session: GameSession,
  wordsByPlayer: Map<string, string[]>,
  options?: {
    viewerUid?: string;
    displaysByPlayer?: Map<string, string[]>;
  },
) {
  const uniqueBonusEnabled = resolveGameSessionSettingsForSession(session).uniqueBonusEnabled;
  const displaysByPlayer = options?.displaysByPlayer ?? new Map<string, string[]>();
  const roundDurationSeconds = computeRoundDurationSeconds(session);
  const standings: PlayerStandings[] = buildLiveStandingsFromSession({
    ...session,
    wordPlayers: wordPlayersFromWordsByPlayer(wordsByPlayer),
  });
  const directory = createOnlineResultsDirectory(session, options?.viewerUid);

  const globalWords = buildGlobalResultWords({
    wordsByPlayer,
    displaysByPlayer,
    directory,
    uniqueBonusEnabled,
  });

  const playerRankGroups = buildPlayerResultRankGroups({
    wordsByPlayer,
    displaysByPlayer,
    directory,
    uniqueBonusEnabled,
    standings,
    roundDurationSeconds,
  });

  const headline = formatResultsHeadline(t, directory, standings, uniqueBonusEnabled);
  const isSolo = isSoloStandings(standings);
  const resolvedSettings = resolveGameSessionSettingsForSession(session);

  return {
    headline,
    baseWordDisplay: sessionBaseWordDisplay(session),
    totalDistinctWords: globalWords.length,
    globalWords,
    playerRankGroups,
    standings,
    uniqueBonusEnabled,
    roundDurationSeconds,
    isSolo,
    allowProperNouns: resolvedSettings.allowProperNouns,
    allowSlang: resolvedSettings.allowSlang,
  };
}

export type RoundResultsViewData = NonNullable<ReturnType<typeof buildOnlineResultsView>>;
