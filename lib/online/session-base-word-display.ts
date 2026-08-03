import { toDisplayUpper } from '../dictionary/normalize.js';

/**
 * Surface form for lobby / letter keyboard / results.
 * Identity is normalized `baseWord`; UI prefers `baseWordDisplay` when set.
 * Submitted word labels resolve from the round lexicon (not RTDB).
 */
export function sessionBaseWordDisplay(session: {
  baseWord: string;
  baseWordDisplay?: string;
}): string {
  const display = session.baseWordDisplay?.trim();
  if (typeof display === 'string' && display.length > 0) {
    return toDisplayUpper(display);
  }
  return toDisplayUpper(session.baseWord);
}
