/**
 * Maximum number of rounds allowed in a single online room
 * (0-based indices `0 .. MAX_ROUNDS_PER_ROOM - 1`).
 *
 * Nearby Want is capped to this many prior slots (`0 .. min(N, MAX)-1`).
 *
 * Product rematch stop: after the final finished round, clients must not open
 * `finished → waiting` in the same `gameId` (see ADR-024).
 */
export const MAX_ROUNDS_PER_ROOM = 12 as const;

/** True when `baseWordRound` is the last allowed round index in the room. */
export function isFinalRoomRound(baseWordRound: number): boolean {
  return baseWordRound >= MAX_ROUNDS_PER_ROOM - 1;
}

/** True when rematch may advance to the next round after this finished index. */
export function canRematchAfterRound(baseWordRound: number): boolean {
  return baseWordRound < MAX_ROUNDS_PER_ROOM - 1;
}
