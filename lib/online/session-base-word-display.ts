import { toDisplayUpper } from '../dictionary/normalize.js';

/**
 * Surface form for lobby / letter keyboard / results.
 * Same split as `player_words/{uid}/{normalized}.display`: identity is `baseWord`
 * (normalized), UI reads `baseWordDisplay` when set.
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
