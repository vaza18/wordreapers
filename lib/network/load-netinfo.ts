import { NativeModules, Platform } from 'react-native';

import type { NetInfoState } from '@react-native-community/netinfo';

/** Subset of NetInfo used by connectivity hooks. */
export type NetInfoClient = {
  addEventListener: (listener: (state: NetInfoState) => void) => () => void;
  fetch: () => Promise<NetInfoState>;
};

/** `false` = not yet loaded; `null` = unavailable after a failed probe. */
let cached: NetInfoClient | null | false = false;

/** True when the dev client binary includes the NetInfo native module. */
export function isNativeNetInfoLinked(): boolean {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return false;
  }
  return Boolean((NativeModules as { RNCNetInfo?: unknown }).RNCNetInfo);
}

function resolveNetInfoModule(module: unknown): NetInfoClient | null {
  if (!module || typeof module !== 'object') {
    return null;
  }
  const candidate =
    'default' in module
      ? (module as { default?: NetInfoClient }).default
      : (module as NetInfoClient);
  if (!candidate?.addEventListener || !candidate?.fetch) {
    return null;
  }
  return candidate;
}

function probeNetInfoClient(client: NetInfoClient): boolean {
  try {
    const unsubscribe = client.addEventListener(() => {});
    unsubscribe();
    return true;
  } catch {
    return false;
  }
}

function markNetInfoUnavailable(reason?: unknown): null {
  if (__DEV__ && reason !== undefined) {
    console.warn(
      '[NetInfo] Native module unavailable; device connectivity assumed online. Rebuild the dev client after adding @react-native-community/netinfo.',
      reason,
    );
  }
  cached = null;
  return null;
}

/**
 * Load NetInfo lazily. Returns null when the native module is missing
 * (e.g. dev client not rebuilt after adding the dependency).
 */
export function loadNetInfoClient(): NetInfoClient | null {
  if (cached !== false) {
    return cached;
  }

  if (!isNativeNetInfoLinked()) {
    return markNetInfoUnavailable();
  }

  try {
    // Avoid top-level import — the package throws if RNCNetInfo is null.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('@react-native-community/netinfo') as unknown;
    const client = resolveNetInfoModule(module);
    if (!client || !probeNetInfoClient(client)) {
      return markNetInfoUnavailable(new Error('NetInfo native module unavailable'));
    }
    cached = client;
    return cached;
  } catch (error) {
    return markNetInfoUnavailable(error);
  }
}
