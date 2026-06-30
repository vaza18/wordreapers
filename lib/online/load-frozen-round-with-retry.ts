import type { FrozenFinishedRound } from './frozen-finished-round.js';

const DEFAULT_ATTEMPTS = 8;
const DEFAULT_DELAY_MS = 200;

/**
 * Retry loading a frozen round snapshot (archive may lag behind RTDB finish).
 */
export async function loadFrozenRoundWithRetry(
  loader: () => Promise<FrozenFinishedRound | null>,
  options?: { attempts?: number; delayMs?: number },
): Promise<FrozenFinishedRound | null> {
  const attempts = options?.attempts ?? DEFAULT_ATTEMPTS;
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const archived = await loader();
    if (archived) {
      return archived;
    }
    if (attempt < attempts - 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }
  return null;
}
