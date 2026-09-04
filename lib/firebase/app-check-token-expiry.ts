/** Parse JWT `exp` (seconds) into millis for firebase/app-check CustomProvider. */
export function expireTimeMillisFromAppCheckJwt(token: string, nowMs = Date.now()): number {
  try {
    const segment = token.split('.')[1];
    if (!segment) {
      return nowMs + 55 * 60 * 1000;
    }

    // React Native: globalThis.atob might be missing or limited (padding issues).
    // Use a robust base64-url decoder.
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = globalThis.atob(base64 + padding);

    const payload = JSON.parse(decoded) as { exp?: unknown };
    if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
      return payload.exp * 1000;
    }
  } catch {
    // Fall through to conservative default.
  }
  return nowMs + 55 * 60 * 1000;
}
