import { buildStandingsFromSession } from '@/lib/game/scoring';
import { isSoloStandings } from '@/lib/game/solo-round';
import { didPlayerWinOnlineRound } from '@/lib/profile/player-stats';
import { resolveGameSessionSettingsForSession } from '@/lib/firebase/session-settings';
import { displayPlayerName } from '@/lib/online/public-lobby/display-player-name';
import type { FinishedRoundArchive } from '@/lib/online/session/online-session-archive';

export interface RoomPlayerAggregate {
  playerId: string;
  name: string;
  roundWins: number;
  totalScore: number;
  totalWords: number;
}

export interface RoomHistoryAggregate {
  gameId: string;
  roundCount: number;
  uniquePlayerCount: number;
  /** True when auto x2 applied (3+ players in the room). */
  showScores: boolean;
  oldestSavedAt: number;
  newestSavedAt: number;
  standings: RoomPlayerAggregate[];
  archives: FinishedRoundArchive[];
}

export type HistoryListEntry =
  | { kind: 'room'; aggregate: RoomHistoryAggregate }
  | { kind: 'round'; archive: FinishedRoundArchive };

export function isMultiplayerArchive(archive: FinishedRoundArchive): boolean {
  return !isSoloStandings(buildStandingsFromSession(archive.session));
}

/** Solo training with no accepted words — skip in history list (and no longer archived). */
export function isEmptySoloArchive(archive: FinishedRoundArchive): boolean {
  if (isMultiplayerArchive(archive)) {
    return false;
  }
  const solo = archive.session.players.solo;
  return (solo?.wordCount ?? 0) <= 0;
}

export type HistoryListFilter = 'all' | 'competition' | 'training';

function isCompetitionHistoryEntry(entry: HistoryListEntry): boolean {
  if (entry.kind === 'room') {
    return true;
  }
  return isMultiplayerArchive(entry.archive);
}

/** Filter main history list by competition (multiplayer) vs training (solo). */
export function filterHistoryListEntries(
  entries: readonly HistoryListEntry[],
  filter: HistoryListFilter,
): HistoryListEntry[] {
  if (filter === 'all') {
    return [...entries];
  }
  if (filter === 'competition') {
    return entries.filter(isCompetitionHistoryEntry);
  }
  return entries.filter((entry) => !isCompetitionHistoryEntry(entry));
}

/** Room leaderboard uses points when 3+ players and unique bonus mode is auto. */
export function roomAggregateShowsScores(archives: readonly FinishedRoundArchive[]): boolean {
  if (archives.length === 0) {
    return false;
  }
  const uniquePlayers = new Set<string>();
  let hasAutoBonusMode = false;
  for (const archive of archives) {
    for (const playerId of Object.keys(archive.session.players)) {
      uniquePlayers.add(playerId);
    }
    const settings = resolveGameSessionSettingsForSession(archive.session);
    if (settings.uniqueBonusMode === 'auto') {
      hasAutoBonusMode = true;
    }
  }
  return uniquePlayers.size >= 3 && hasAutoBonusMode;
}

function compareRoomPlayerAggregate(
  a: RoomPlayerAggregate,
  b: RoomPlayerAggregate,
  showScores: boolean,
): number {
  if (b.roundWins !== a.roundWins) {
    return b.roundWins - a.roundWins;
  }
  if (showScores && b.totalScore !== a.totalScore) {
    return b.totalScore - a.totalScore;
  }
  if (b.totalWords !== a.totalWords) {
    return b.totalWords - a.totalWords;
  }
  return a.playerId.localeCompare(b.playerId);
}

function isRoomAggregateTied(
  a: RoomPlayerAggregate,
  b: RoomPlayerAggregate,
  showScores: boolean,
): boolean {
  if (a.roundWins !== b.roundWins) {
    return false;
  }
  if (showScores && a.totalScore !== b.totalScore) {
    return false;
  }
  return a.totalWords === b.totalWords;
}

/** Display ranks for room standings (ties share rank). */
export function assignRoomDisplayRanks(
  standings: readonly RoomPlayerAggregate[],
  showScores = false,
): Map<string, number> {
  const ranks = new Map<string, number>();
  let rank = 1;

  for (let index = 0; index < standings.length; index += 1) {
    const row = standings[index];
    if (row === undefined) {
      continue;
    }
    if (index > 0) {
      const previous = standings[index - 1];
      if (previous !== undefined && !isRoomAggregateTied(previous, row, showScores)) {
        rank += 1;
      }
    }
    ranks.set(row.playerId, rank);
  }

  return ranks;
}

export function computeRoomHistoryAggregate(
  gameId: string,
  archives: readonly FinishedRoundArchive[],
  viewerUid = '',
): RoomHistoryAggregate {
  const sorted = [...archives].sort((a, b) => b.savedAt - a.savedAt);
  const showScores = roomAggregateShowsScores(sorted);
  const stats = new Map<
    string,
    { roundWins: number; totalScore: number; totalWords: number; name: string | null }
  >();

  for (const archive of sorted) {
    const standings = buildStandingsFromSession(archive.session);
    for (const [playerId, player] of Object.entries(archive.session.players)) {
      const existing = stats.get(playerId) ?? {
        roundWins: 0,
        totalScore: 0,
        totalWords: 0,
        name: null,
      };
      existing.totalScore += player.score ?? 0;
      existing.totalWords += player.wordCount ?? 0;
      if (existing.name == null) {
        existing.name = displayPlayerName(player, viewerUid, playerId, archive.session);
      }
      if (didPlayerWinOnlineRound(playerId, standings)) {
        existing.roundWins += 1;
      }
      stats.set(playerId, existing);
    }
  }

  const standings: RoomPlayerAggregate[] = [...stats.entries()]
    .map(([playerId, row]) => ({
      playerId,
      name: row.name ?? playerId,
      roundWins: row.roundWins,
      totalScore: row.totalScore,
      totalWords: row.totalWords,
    }))
    .sort((a, b) => compareRoomPlayerAggregate(a, b, showScores));

  const savedAtValues = sorted.map((archive) => archive.savedAt);

  return {
    gameId,
    roundCount: sorted.length,
    uniquePlayerCount: stats.size,
    showScores,
    oldestSavedAt: Math.min(...savedAtValues),
    newestSavedAt: Math.max(...savedAtValues),
    standings,
    archives: sorted,
  };
}

function groupMultiplayerArchivesByGameId(
  archives: readonly FinishedRoundArchive[],
): Map<string, FinishedRoundArchive[]> {
  const groups = new Map<string, FinishedRoundArchive[]>();
  for (const archive of archives) {
    if (!isMultiplayerArchive(archive)) {
      continue;
    }
    const existing = groups.get(archive.gameId) ?? [];
    existing.push(archive);
    groups.set(archive.gameId, existing);
  }
  return groups;
}

/** Whether the viewer finished at display rank 1 in the room aggregate. */
export function didPlayerLeadRoomAggregate(
  playerId: string,
  aggregate: RoomHistoryAggregate,
): boolean {
  if (!playerId || aggregate.standings.length === 0) {
    return false;
  }
  const ranks = assignRoomDisplayRanks(aggregate.standings, aggregate.showScores);
  return ranks.get(playerId) === 1;
}

/** Build main history list with multi-round rooms collapsed into one aggregate entry. */
export function buildHistoryListEntries(
  archives: readonly FinishedRoundArchive[],
  viewerUid = '',
): HistoryListEntry[] {
  const sorted = [...archives].sort((a, b) => b.savedAt - a.savedAt);
  const groups = groupMultiplayerArchivesByGameId(archives);
  const roomAggregates = new Map<string, RoomHistoryAggregate>();

  for (const [gameId, groupArchives] of groups.entries()) {
    if (groupArchives.length >= 2) {
      roomAggregates.set(gameId, computeRoomHistoryAggregate(gameId, groupArchives, viewerUid));
    }
  }

  const emittedRooms = new Set<string>();
  const entries: HistoryListEntry[] = [];

  for (const archive of sorted) {
    if (isEmptySoloArchive(archive)) {
      continue;
    }
    const aggregate = roomAggregates.get(archive.gameId);
    if (aggregate) {
      if (emittedRooms.has(archive.gameId)) {
        continue;
      }
      emittedRooms.add(archive.gameId);
      entries.push({ kind: 'room', aggregate });
      continue;
    }
    entries.push({ kind: 'round', archive });
  }

  return entries;
}

/** Multiplayer archives for one room, newest first. */
export function filterMultiplayerArchivesForGame(
  archives: readonly FinishedRoundArchive[],
  gameId: string,
): FinishedRoundArchive[] {
  return archives
    .filter((archive) => archive.gameId === gameId && isMultiplayerArchive(archive))
    .sort((a, b) => b.savedAt - a.savedAt);
}
