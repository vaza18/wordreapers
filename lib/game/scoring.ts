/** Unique-word x2 bonus setting before a round starts. */
export type UniqueBonusMode = 'auto' | 'off';

/** How a word contributes to score. */
export type WordScoreKind = 'unique' | 'normal';

/** Badge shown next to a word: x2 for unique bonus, +N for shared words. */
export type WordScoreBadge = 'x2' | `+${number}` | null;

/** Scored word entry for one player. */
export interface ScoredWordEntry {
  normalized: string;
  kind: WordScoreKind;
  points: number;
  badge: WordScoreBadge;
}

/** Player totals used for standings and the results screen. */
export interface PlayerStandings {
  playerId: string;
  score: number;
  wordCount: number;
  uniqueCount: number;
}

/**
 * Resolve whether the x2 unique-word bonus is active for a round.
 * Auto enables the bonus for three or more players.
 */
export function resolveUniqueBonusEnabled(mode: UniqueBonusMode, playerCount: number): boolean {
  if (mode === 'off') {
    return false;
  }
  return playerCount >= 3;
}

/**
 * Build overlap badge (+N) where N is how many other players share the word.
 */
export function overlapBadge(otherPlayerCount: number): WordScoreBadge {
  if (otherPlayerCount <= 0) {
    return null;
  }
  return `+${otherPlayerCount}`;
}

/**
 * Points and badge for one word given global player count on that word.
 */
export function scoreWord(
  kind: WordScoreKind,
  uniqueBonusEnabled: boolean,
  globalPlayerCount: number,
): Pick<ScoredWordEntry, 'kind' | 'points' | 'badge'> {
  const others = Math.max(0, globalPlayerCount - 1);

  if (uniqueBonusEnabled && kind === 'unique') {
    return { kind, points: 2, badge: 'x2' };
  }

  const badge = kind === 'normal' ? overlapBadge(others) : null;
  return { kind, points: 1, badge };
}

/**
 * Build a scored entry from a normalized word, kind, and session-wide counts.
 */
export function toScoredWordEntry(
  normalized: string,
  kind: WordScoreKind,
  uniqueBonusEnabled: boolean,
  globalPlayerCount = 1,
): ScoredWordEntry {
  const scored = scoreWord(kind, uniqueBonusEnabled, globalPlayerCount);
  return {
    normalized,
    ...scored,
  };
}

/**
 * Sum points for a player's scored words.
 */
export function computePlayerScore(entries: readonly ScoredWordEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.points, 0);
}

/**
 * Count words that still carry the uniqueness bonus.
 */
export function countUniqueWords(entries: readonly ScoredWordEntry[]): number {
  return entries.filter((entry) => entry.kind === 'unique').length;
}

/**
 * Recompute all word statuses from per-player word lists.
 * Duplicates across players downgrade everyone with that word to `normal`.
 */
export function recomputeWordScores(
  wordsByPlayer: ReadonlyMap<string, readonly string[]>,
  uniqueBonusEnabled: boolean,
): Map<string, ScoredWordEntry[]> {
  const playersPerWord = new Map<string, number>();

  for (const words of wordsByPlayer.values()) {
    const seen = new Set<string>();
    for (const normalized of words) {
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      playersPerWord.set(normalized, (playersPerWord.get(normalized) ?? 0) + 1);
    }
  }

  const result = new Map<string, ScoredWordEntry[]>();

  for (const [playerId, words] of wordsByPlayer) {
    const entries = words.map((normalized) => {
      const globalCount = playersPerWord.get(normalized) ?? 1;
      const kind: WordScoreKind = globalCount > 1 ? 'normal' : 'unique';
      return toScoredWordEntry(normalized, kind, uniqueBonusEnabled, globalCount);
    });
    result.set(playerId, entries);
  }

  return result;
}

/**
 * Whether two rows share the same place (score and word count).
 */
export function isStandingsTied(a: PlayerStandings, b: PlayerStandings): boolean {
  return a.score === b.score && a.wordCount === b.wordCount;
}

/**
 * Display ranks with ties: equal score + word count → same rank (1, 1, 2 …).
 */
export function assignDisplayRanks(standings: readonly PlayerStandings[]): Map<string, number> {
  const ranks = new Map<string, number>();
  let rank = 1;

  for (let index = 0; index < standings.length; index += 1) {
    const row = standings[index];
    if (row === undefined) {
      continue;
    }
    if (index > 0) {
      const previous = standings[index - 1];
      if (previous !== undefined && !isStandingsTied(previous, row)) {
        rank += 1;
      }
    }
    ranks.set(row.playerId, rank);
  }

  return ranks;
}

/**
 * Display rank for one player in the live standings header / modal.
 */
export function displayRankForPlayer(
  standings: readonly PlayerStandings[],
  playerId: string,
): number {
  const ranks = assignDisplayRanks(standings);
  return ranks.get(playerId) ?? standings.length;
}

/**
 * Sort/compare standings: higher score wins; same score → more words wins; else tie.
 */
export function compareStandings(a: PlayerStandings, b: PlayerStandings): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  if (b.wordCount !== a.wordCount) {
    return b.wordCount - a.wordCount;
  }
  return 0;
}

/**
 * Standings from Firebase session player nodes (authoritative during online play).
 */
export function buildStandingsFromSession(session: {
  players: Record<string, { score?: number; wordCount?: number }>;
}): PlayerStandings[] {
  return Object.entries(session.players)
    .map(([playerId, player]) => ({
      playerId,
      score: player.score ?? 0,
      wordCount: player.wordCount ?? 0,
      uniqueCount: 0,
    }))
    .sort(compareStandings);
}

/**
 * Build standings for results and live rank (sorted for {@link assignDisplayRanks}).
 */
export function buildStandings(
  wordsByPlayer: ReadonlyMap<string, readonly string[]>,
  uniqueBonusEnabled: boolean,
): PlayerStandings[] {
  const scored = recomputeWordScores(wordsByPlayer, uniqueBonusEnabled);

  return [...scored.entries()]
    .map(([playerId, entries]) => ({
      playerId,
      score: computePlayerScore(entries),
      wordCount: entries.length,
      uniqueCount: countUniqueWords(entries),
    }))
    .sort(compareStandings);
}
