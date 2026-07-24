/**
 * Stable dependency key for roster uid lists (avoids effect thrash on new array identity).
 * Order-independent so `Object.keys` reshuffles do not restart the fetch.
 */
export function rosterPlayerIdsKey(rosterPlayerIds: readonly string[]): string {
  return [...rosterPlayerIds].sort().join('\0');
}
