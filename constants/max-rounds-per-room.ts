/**
 * Maximum number of rounds allowed in a single online room (0-based indices `0 .. MAX-1`).
 * Nearby Want is capped to this many prior slots (`0 .. min(N, MAX)-1`).
 *
 * TODO(product): Enforce rematch stop at this cap — replace «Грати ще» with «Нова гра»
 * (home/setup), optional «Переглянути переможців кімнати» → room history on the final
 * results screen; Firebase rules + client. See ADR-023 deferred notes.
 */
export const MAX_ROUNDS_PER_ROOM = 12 as const;
