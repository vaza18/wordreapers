import { useEffect, useState } from 'react';

import { loadNetInfoClient } from '@/lib/network/load-netinfo';
import type { NetInfoState } from '@react-native-community/netinfo';

export type NetworkConnectivity = {
  isConnected: boolean;
  isInternetReachable: boolean | null;
};

const ASSUMED_ONLINE: NetworkConnectivity = {
  isConnected: true,
  isInternetReachable: null,
};

function readConnectivity(state: NetInfoState): NetworkConnectivity {
  const connected = state.isConnected === true && state.isInternetReachable !== false;
  return {
    isConnected: connected,
    isInternetReachable: state.isInternetReachable,
  };
}

/**
 * Device network reachability via NetInfo.
 * Falls back to "connected" when the native module is unavailable or monitoring is off.
 */
export function useNetworkConnectivity(enabled = true): NetworkConnectivity {
  const [connectivity, setConnectivity] = useState<NetworkConnectivity>(ASSUMED_ONLINE);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const netInfo = loadNetInfoClient();
    if (!netInfo) {
      return undefined;
    }

    try {
      const unsubscribe = netInfo.addEventListener((state) => {
        setConnectivity(readConnectivity(state));
      });
      void netInfo.fetch().then(
        (state) => {
          setConnectivity(readConnectivity(state));
        },
        () => {
          setConnectivity(ASSUMED_ONLINE);
        },
      );
      return unsubscribe;
    } catch (error) {
      if (__DEV__) {
        console.warn('[NetInfo] Listener setup failed; device connectivity assumed online.', error);
      }
      return undefined;
    }
  }, [enabled]);

  if (!enabled) {
    return ASSUMED_ONLINE;
  }

  return connectivity;
}
