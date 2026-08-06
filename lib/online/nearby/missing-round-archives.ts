import { MAX_ROUNDS_PER_ROOM } from '../../../constants/max-rounds-per-room.js';
import type { FinishedRoundArchive } from '../session/online-session-archive.js';

/**
 * Prior rounds expected for nearby sync / advertise-stop at live N:
 * `0 .. min(N, MAX_ROUNDS_PER_ROOM)-1` (aligned with Want).
 */
export function expectedPriorRounds(baseWordRound: number): number[] {
  if (!Number.isFinite(baseWordRound) || baseWordRound <= 0) {
    return [];
  }
  const n = Math.min(Math.floor(baseWordRound), MAX_ROUNDS_PER_ROOM);
  return Array.from({ length: n }, (_, index) => index);
}

/** Rounds in capped `0..min(N,MAX)-1` missing from local multiplayer archives for this room. */
export function missingRoundArchives(
  baseWordRound: number,
  archives: readonly Pick<FinishedRoundArchive, 'baseWordRound'>[],
): number[] {
  const expected = expectedPriorRounds(baseWordRound);
  if (expected.length === 0) {
    return [];
  }
  const have = new Set(archives.map((archive) => archive.baseWordRound));
  return expected.filter((round) => !have.has(round));
}

/** True when local archives cover every nearby-capped prior round for live N. */
export function hasCompletePriorHistory(
  baseWordRound: number,
  archives: readonly Pick<FinishedRoundArchive, 'baseWordRound'>[],
): boolean {
  return missingRoundArchives(baseWordRound, archives).length === 0;
}

/** Round numbers present in a haveRounds list (deduped, sorted). */
export function normalizeHaveRounds(haveRounds: readonly number[]): number[] {
  const unique = new Set<number>();
  for (const round of haveRounds) {
    if (Number.isFinite(round) && round >= 0) {
      unique.add(Math.floor(round));
    }
  }
  return [...unique].sort((a, b) => a - b);
}

/**
 * Whether `haveRounds` covers all nearby-capped priors `0..min(N,MAX)-1`.
 * Product rematch stop past MAX is enforced separately (ADR-024).
 */
export function haveRoundsCompleteForN(
  baseWordRound: number,
  haveRounds: readonly number[],
): boolean {
  const expected = expectedPriorRounds(baseWordRound);
  if (expected.length === 0) {
    return true;
  }
  const have = new Set(normalizeHaveRounds(haveRounds));
  return expected.every((round) => have.has(round));
}
