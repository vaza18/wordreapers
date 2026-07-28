/**
 * Play-screen loadError after an RTDB session callback.
 * Recovering sessions must clear a sticky «room not found» from a prior null.
 */
export function nextPlaySessionLoadError(
  previousError: string | null,
  nextSession: unknown,
  roomNotFoundMessage: string,
): string | null {
  if (nextSession) {
    return null;
  }
  return previousError ?? roomNotFoundMessage;
}
