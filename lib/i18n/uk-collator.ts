/** Shared Ukrainian collator — reuse instead of per-call `localeCompare('uk')` (slow on Hermes). */
const UK_COLLATOR = new Intl.Collator('uk');

/** Compare two strings with Ukrainian collation (`Intl.Collator('uk')`). */
export function compareUk(a: string, b: string): number {
  return UK_COLLATOR.compare(a, b);
}
