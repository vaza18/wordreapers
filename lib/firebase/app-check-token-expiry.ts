/** Parse JWT `exp` (seconds) into millis for firebase/app-check CustomProvider. */
export function expireTimeMillisFromAppCheckJwt(token: string, nowMs = Date.now()): number {
  try {
    const segment = token.split('.')[1];
    if (!segment) {
      return nowMs + 55 * 60 * 1000;
    }
    const payload = JSON.parse(globalThis.atob(segment)) as { exp?: unknown };
    if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
      return payload.exp * 1000;
    }
  } catch {
    // Fall through to conservative default.
  }
  return nowMs + 55 * 60 * 1000;
}
