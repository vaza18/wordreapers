import type { NetInfoState } from '@react-native-community/netinfo';

/** Subset of NetInfo used by connectivity hooks. */
export type NetInfoClient = {
  addEventListener: (listener: (state: NetInfoState) => void) => () => void;
  fetch: () => Promise<NetInfoState>;
};

let cached: NetInfoClient | null | undefined;

/**
 * Load NetInfo lazily. Returns null when the native module is missing
 * (e.g. dev client not rebuilt after adding the dependency).
 */
export function loadNetInfoClient(): NetInfoClient | null {
  if (cached !== undefined) {
    return cached;
  }
  try {
    // Avoid top-level import — the package throws if RNCNetInfo is null.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('@react-native-community/netinfo') as {
      default: NetInfoClient;
    };
    cached = module.default;
    return cached;
  } catch (error) {
    if (__DEV__) {
      console.warn(
        '[NetInfo] Native module unavailable; device connectivity assumed online. Rebuild the dev client after adding @react-native-community/netinfo.',
        error,
      );
    }
    cached = null;
    return null;
  }
}
