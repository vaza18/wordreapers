import { useEffect, useState } from 'react';

import { loadNetInfoClient } from '@/lib/network/load-netinfo';
import type { NetInfoState } from '@react-native-community/netinfo';

export type NetworkConnectivity = {
  isConnected: boolean;
  isInternetReachable: boolean | null;
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
 * Falls back to "connected" when the native module is unavailable.
 */
export function useNetworkConnectivity(): NetworkConnectivity {
  const [connectivity, setConnectivity] = useState<NetworkConnectivity>({
    isConnected: true,
    isInternetReachable: null,
  });

  useEffect(() => {
    const netInfo = loadNetInfoClient();
    if (!netInfo) {
      return undefined;
    }

    const unsubscribe = netInfo.addEventListener((state) => {
      setConnectivity(readConnectivity(state));
    });
    void netInfo.fetch().then((state) => {
      setConnectivity(readConnectivity(state));
    });
    return unsubscribe;
  }, []);

  return connectivity;
}
