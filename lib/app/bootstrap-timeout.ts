const DEFAULT_LOCAL_BOOTSTRAP_MS = 5_000;
const DEFAULT_FIREBASE_BOOTSTRAP_MS = 15_000;

/**
 * Resolve when `promise` settles or `ms` elapses (whichever comes first).
 */
export async function withBootstrapTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.warn(`Bootstrap timeout (${ms}ms): ${label}`);
          }
          resolve(null);
        }, ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export const LOCAL_BOOTSTRAP_TIMEOUT_MS = DEFAULT_LOCAL_BOOTSTRAP_MS;
export const FIREBASE_BOOTSTRAP_TIMEOUT_MS = DEFAULT_FIREBASE_BOOTSTRAP_MS;
