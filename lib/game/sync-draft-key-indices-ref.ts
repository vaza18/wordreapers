/**
 * Keep `draftKeyIndicesRef` in lockstep with React state.
 * After accept, state can clear while the ref still holds used keys — the next
 * press then appends onto the stale list and leaves “ghost” disabled letters.
 */
export function syncDraftKeyIndicesRef(
  ref: { current: number[] },
  next: readonly number[],
): number[] {
  const copy = [...next];
  ref.current = copy;
  return copy;
}
