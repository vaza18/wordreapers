import { normalizeRoomCode } from '../../firebase/room-code.js';

import type { FrozenFinishedRound } from './frozen-finished-round.js';

/**
 * In-memory play→results pin so results can freeze without waiting on AsyncStorage
 * and without enabling a second wordPlayers seed listen (finish→results ↓ spike).
 *
 * Peek is idempotent (React Strict Mode remounts); clear after freeze is applied.
 */
let handoff: {
  gameId: string;
  baseWordRound: number;
  round: FrozenFinishedRound;
} | null = null;

/** Stage a rich finished freeze for the next results mount of this room/round. */
export function setFinishedRoundResultsHandoff(
  gameId: string,
  baseWordRound: number,
  round: FrozenFinishedRound,
): void {
  handoff = {
    gameId: normalizeRoomCode(gameId),
    baseWordRound,
    round,
  };
}

/** Non-consuming read — safe across Strict Mode double effects. */
export function peekFinishedRoundResultsHandoff(
  gameId: string,
  baseWordRound: number | null | undefined,
): FrozenFinishedRound | null {
  if (handoff == null || baseWordRound == null) {
    return null;
  }
  if (handoff.gameId !== normalizeRoomCode(gameId) || handoff.baseWordRound !== baseWordRound) {
    return null;
  }
  return handoff.round;
}

/** Drop a matching handoff after results applied the freeze (or on leave). */
export function clearFinishedRoundResultsHandoff(
  gameId?: string,
  baseWordRound?: number | null,
): void {
  if (gameId == null || baseWordRound == null) {
    handoff = null;
    return;
  }
  if (
    handoff &&
    handoff.gameId === normalizeRoomCode(gameId) &&
    handoff.baseWordRound === baseWordRound
  ) {
    handoff = null;
  }
}

/** Test / leave cleanup. */
export function resetFinishedRoundResultsHandoff(): void {
  handoff = null;
}
