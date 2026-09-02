import { NativeModule, requireNativeModule } from 'expo-modules-core';

export interface TrafficBytes {
  rxBytes: number;
  txBytes: number;
}

declare class NativeTrafficStatsModule extends NativeModule {
  getAppTrafficBytes(): TrafficBytes;
}

let NativeTrafficStats: NativeTrafficStatsModule | null = null;
try {
  NativeTrafficStats = requireNativeModule<NativeTrafficStatsModule>('NativeTrafficStats');
} catch {
  // Native module not available (e.g. web or dev client not rebuilt)
}

/** Fetch cumulative app network traffic since last reboot (Android) or total device (iOS). */
export function getAppTrafficBytes(): TrafficBytes {
  if (!NativeTrafficStats) {
    return { rxBytes: -1, txBytes: -1 };
  }
  return NativeTrafficStats.getAppTrafficBytes();
}
