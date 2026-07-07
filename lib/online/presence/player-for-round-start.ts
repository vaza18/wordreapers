import type { GameSessionPlayer } from '../../firebase/types.js';

/** Reset per-player totals for a new playing round; preserve lobby presence flags. */
export function playerForRoundStart(player: GameSessionPlayer): GameSessionPlayer {
  return {
    ...player,
    score: 0,
    wordCount: 0,
    hasLeft: false,
  };
}
