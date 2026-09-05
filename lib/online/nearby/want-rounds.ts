import { MAX_ROUNDS_PER_ROOM } from '../../../constants/max-rounds-per-room.js';
import { normalizeHaveRounds } from './missing-round-archives.js';

/** Reject oversized / out-of-range Want lists on the host. */
export function sanitizeWantRounds(wantRounds: readonly number[]): number[] | null {
  if (!Array.isArray(wantRounds) || wantRounds.length === 0) {
    return null;
  }
  if (wantRounds.length > MAX_ROUNDS_PER_ROOM) {
    return null;
  }
  const normalized = normalizeHaveRounds(wantRounds);
  if (
    normalized.length === 0 ||
    normalized.length > MAX_ROUNDS_PER_ROOM ||
    normalized.some((round) => round >= MAX_ROUNDS_PER_ROOM)
  ) {
    return null;
  }
  return normalized;
}
