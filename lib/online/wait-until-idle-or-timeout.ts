/**
 * Wait until `isIdle()` is true or `timeoutMs` elapses.
 * Used so results archive does not freeze words that are still syncing to RTDB.
 */
export async function waitUntilIdleOrTimeout(
  isIdle: () => boolean,
  timeoutMs: number,
  pollMs = 50,
): Promise<'idle' | 'timeout'> {
  if (isIdle()) {
    return 'idle';
  }
  const deadline = Date.now() + Math.max(0, timeoutMs);
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, pollMs);
    });
    if (isIdle()) {
      return 'idle';
    }
  }
  return isIdle() ? 'idle' : 'timeout';
}
