import type { PlayerStandings } from './scoring.js';

/** True when the round has a single active standings row (solo / no opponents yet). */
export function isSoloStandings(standings: readonly PlayerStandings[]): boolean {
  return standings.length < 2;
}
