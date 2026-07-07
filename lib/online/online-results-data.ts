import { toDisplayUpper } from '../dictionary/normalize.js';
import type { StoredPlayerWord } from '../firebase/player-words-service.js';
import { resolveGameSessionSettingsForSession } from '../firebase/session-settings.js';
import type { GameSession } from '../firebase/types.js';
import { createOnlineResultsDirectory } from '../game/results-directory.js';
import { formatResultsHeadline } from '../game/results-headline.js';
import { buildGlobalResultWords, buildPlayerResultRankGroups } from '../game/results-view.js';
import { computeRoundDurationSeconds } from '../game/round-duration.js';
import { buildLiveStandingsFromSession } from './live-standings.js';
import { isSoloStandings } from '../game/solo-round.js';
import { buildStandingsFromSession, type PlayerStandings } from '../game/scoring.js';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function firebaseWordsToMaps(
  byPlayer: ReadonlyMap<string, ReadonlyMap<string, StoredPlayerWord>>,
): {
  wordsByPlayer: Map<string, string[]>;
  displaysByPlayer: Map<string, string[]>;
} {
  const wordsByPlayer = new Map<string, string[]>();
  const displaysByPlayer = new Map<string, string[]>();

  for (const [playerId, words] of Array.from(byPlayer)) {
    const sorted: [string, StoredPlayerWord][] = Array.from(words.entries()).sort(
      (a, b) => a[1].at - b[1].at,
    );
    const normals: string[] = [];
    const displays: string[] = [];
    for (const [normalized, row] of sorted) {
      normals.push(normalized);
      displays.push(String(row.display));
    }
    wordsByPlayer.set(playerId, normals);
    displaysByPlayer.set(playerId, displays);
  }

  return { wordsByPlayer, displaysByPlayer };
}

/**
 * Build the same results view model as local play from Firebase session + words.
 */
export function buildOnlineResultsView(
  t: TranslateFn,
  session: GameSession,
  byPlayer: ReadonlyMap<string, ReadonlyMap<string, StoredPlayerWord>>,
  options?: { finishedAtMs?: number; viewerUid?: string },
) {
  const uniqueBonusEnabled = resolveGameSessionSettingsForSession(session).uniqueBonusEnabled;
  const { wordsByPlayer, displaysByPlayer } = firebaseWordsToMaps(byPlayer);
  const roundDurationSeconds = computeRoundDurationSeconds(
    session,
    byPlayer,
    options?.finishedAtMs,
  );
  // Prefer word-map totals when present (matches x2 badges); fall back to stored player nodes.
  const standings: PlayerStandings[] =
    Object.keys(session.wordPlayers ?? {}).length > 0
      ? buildLiveStandingsFromSession(session)
      : buildStandingsFromSession(session);
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

  return {
    headline,
    baseWordDisplay: toDisplayUpper(session.baseWord),
    totalDistinctWords: globalWords.length,
    globalWords,
    playerRankGroups,
    standings,
    uniqueBonusEnabled,
    roundDurationSeconds,
    isSolo,
  };
}

export type RoundResultsViewData = NonNullable<ReturnType<typeof buildOnlineResultsView>>;
