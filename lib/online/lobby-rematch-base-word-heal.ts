/**
 * Bounded RTDB heal while rematch waiting still has no base word.
 * Listener can miss peer `baseWord` under multi-sim AppState races; focus /
 * AppState / `justOptedIn` heals stay event-driven. This poll is a short
 * safety net only — not an indefinite `get()` loop.
 */

export const LOBBY_REMATCH_BASE_WORD_HEAL_INTERVAL_MS = 2000;

/** Stop after ~30s of quiet waiting without a committed base word. */
export const LOBBY_REMATCH_BASE_WORD_HEAL_MAX_TICKS = 15;

export function shouldRunLobbyRematchBaseWordHealPoll(options: {
  focused: boolean;
  status: string | undefined;
  baseWordRound: number | null | undefined;
  baseWord: string | null | undefined;
}): boolean {
  if (!options.focused || options.status !== 'waiting') {
    return false;
  }
  if ((options.baseWordRound ?? 0) === 0) {
    return false;
  }
  const word = options.baseWord;
  return !(typeof word === 'string' && word.length >= 2);
}

/** Whether the next interval tick should still fire (`tickIndex` is 1-based after each fire). */
export function shouldContinueLobbyRematchBaseWordHealTick(tickIndex: number): boolean {
  return tickIndex >= 1 && tickIndex <= LOBBY_REMATCH_BASE_WORD_HEAL_MAX_TICKS;
}
