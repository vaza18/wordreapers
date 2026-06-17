import { toDisplayUpper } from '../dictionary/normalize.js';
import type { ResultsPlayerDirectory } from './results-directory.js';
import { computeWordsPerMinute } from './round-duration.js';
import type { PlayerStandings, ScoredWordEntry, WordScoreKind } from './scoring.js';
import { groupStandingsByDisplayRank } from './rank-groups.js';
import { assignDisplayRanks, recomputeWordScores } from './scoring.js';
import { overlapPeersFromWordMap, type WordOverlapPeer } from './word-overlap-peers.js';

/** One player attribution on the global results word list. */
export interface GlobalWordAuthor {
  playerId: string;
  playerName: string;
  avatarColorIndex: number;
  kind: WordScoreKind;
}

/** Row in the «Всі слова» tab. */
export interface GlobalResultWordRow {
  normalized: string;
  display: string;
  authors: GlobalWordAuthor[];
  showX2: boolean;
}

/** One player block in the «По гравцях» tab. */
export interface PlayerResultSection {
  playerId: string;
  playerName: string;
  avatarColorIndex: number;
  rank: number;
  score: number;
  wordCount: number;
  uniqueCount: number;
  words: readonly {
    display: string;
    badge: ScoredWordEntry['badge'];
    overlapPeers: readonly WordOverlapPeer[];
  }[];
  wordsPerMinute: number | null;
  /** Rank 1 (includes ties). */
  isTopRank: boolean;
}

/** «По гравцях» — one rank tier with one or more players on the same level. */
export interface PlayerResultRankGroup {
  rank: number;
  isTopRank: boolean;
  players: readonly PlayerResultSection[];
}

/**
 * Build alphabetically sorted global word list with per-player attribution (TZ §3.5).
 */
export function buildGlobalResultWords(params: {
  wordsByPlayer: ReadonlyMap<string, readonly string[]>;
  displaysByPlayer: ReadonlyMap<string, readonly string[]>;
  directory: ResultsPlayerDirectory;
  uniqueBonusEnabled: boolean;
}): GlobalResultWordRow[] {
  const scored = recomputeWordScores(params.wordsByPlayer, params.uniqueBonusEnabled);

  const aggregated = new Map<string, { display: string; authors: GlobalWordAuthor[] }>();

  for (const [playerId, entries] of scored) {
    const playerName = params.directory.getName(playerId);
    const displays = params.displaysByPlayer.get(playerId) ?? [];

    entries.forEach((entry, index) => {
      const display = displays[index] ?? toDisplayUpper(entry.normalized);
      const existing = aggregated.get(entry.normalized);

      const author: GlobalWordAuthor = {
        playerId,
        playerName,
        avatarColorIndex: params.directory.getAvatarColorIndex(playerId),
        kind: entry.kind,
      };

      if (existing) {
        existing.authors.push(author);
        if (display.length > existing.display.length) {
          existing.display = display;
        }
      } else {
        aggregated.set(entry.normalized, { display, authors: [author] });
      }
    });
  }

  return [...aggregated.entries()]
    .map(([normalized, value]) => {
      const authors = sortAuthors(value.authors);
      const showX2 =
        params.uniqueBonusEnabled && authors.some((author) => author.kind === 'unique');
      return {
        normalized,
        display: value.display,
        authors,
        showX2,
      };
    })
    .sort((a, b) => a.normalized.localeCompare(b.normalized, 'uk'));
}

/**
 * Build ranked player sections for the «По гравцях» tab.
 */
export function buildPlayerResultSections(params: {
  wordsByPlayer: ReadonlyMap<string, readonly string[]>;
  displaysByPlayer: ReadonlyMap<string, readonly string[]>;
  directory: ResultsPlayerDirectory;
  uniqueBonusEnabled: boolean;
  standings: readonly PlayerStandings[];
  roundDurationSeconds?: number;
}): PlayerResultSection[] {
  const scored = recomputeWordScores(params.wordsByPlayer, params.uniqueBonusEnabled);

  const rankByPlayer = assignDisplayRanks(params.standings);

  return params.standings.map((standing) => {
    const entries = scored.get(standing.playerId) ?? [];
    const displays = params.displaysByPlayer.get(standing.playerId) ?? [];

    const words = entries
      .map((entry, index) => ({
        display: displays[index] ?? toDisplayUpper(entry.normalized),
        badge: entry.badge,
        overlapPeers: overlapPeersFromWordMap(
          entry.normalized,
          standing.playerId,
          params.wordsByPlayer,
          (playerId) => params.directory.getName(playerId),
          (playerId) => params.directory.getAvatarColorIndex(playerId),
        ),
      }))
      .sort((a, b) => a.display.localeCompare(b.display, 'uk'));

    const wordsPerMinute =
      params.roundDurationSeconds != null
        ? computeWordsPerMinute(standing.wordCount, params.roundDurationSeconds)
        : null;

    return {
      playerId: standing.playerId,
      playerName: params.directory.getName(standing.playerId),
      avatarColorIndex: params.directory.getAvatarColorIndex(standing.playerId),
      rank: rankByPlayer.get(standing.playerId) ?? 0,
      score: standing.score,
      wordCount: standing.wordCount,
      uniqueCount: standing.uniqueCount,
      words,
      wordsPerMinute,
      isTopRank: rankByPlayer.get(standing.playerId) === 1,
    };
  });
}

/**
 * Build «По гравцях» groups so tied places share one row/tier.
 */
export function buildPlayerResultRankGroups(params: {
  wordsByPlayer: ReadonlyMap<string, readonly string[]>;
  displaysByPlayer: ReadonlyMap<string, readonly string[]>;
  directory: ResultsPlayerDirectory;
  uniqueBonusEnabled: boolean;
  standings: readonly PlayerStandings[];
  roundDurationSeconds?: number;
}): PlayerResultRankGroup[] {
  const sections = buildPlayerResultSections(params);
  const sectionById = new Map(sections.map((section) => [section.playerId, section]));

  return groupStandingsByDisplayRank(params.standings).map((group) => ({
    rank: group.rank,
    isTopRank: group.rank === 1,
    players: group.members
      .map((member) => sectionById.get(member.playerId))
      .filter((section): section is PlayerResultSection => section !== undefined),
  }));
}

function sortAuthors(authors: GlobalWordAuthor[]): GlobalWordAuthor[] {
  return [...authors].sort((a, b) => {
    if (a.kind === 'unique' && b.kind !== 'unique') {
      return -1;
    }
    if (b.kind === 'unique' && a.kind !== 'unique') {
      return 1;
    }
    return a.playerName.localeCompare(b.playerName, 'uk');
  });
}
