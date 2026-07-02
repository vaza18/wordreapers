import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useNetworkConnectivity } from '@/hooks/useNetworkConnectivity';
import { useRtdbConnected } from '@/hooks/useRtdbConnected';

export type ConnectivityState = {
  /** Device has network and RTDB socket is up — safe to submit online words. */
  isOnline: boolean;
  deviceConnected: boolean;
  rtdbConnected: boolean;
};

const ConnectivityContext = createContext<ConnectivityState>({
  isOnline: true,
  deviceConnected: true,
  rtdbConnected: true,
});

/**
 * Provide connectivity state to the app.
 */
export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const { isConnected: deviceConnected } = useNetworkConnectivity();
  const rtdbConnected = useRtdbConnected();
  const value = useMemo(
    () => ({
      isOnline: deviceConnected && rtdbConnected,
      deviceConnected,
      rtdbConnected,
    }),
    [deviceConnected, rtdbConnected],
  );

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

/**
 * Hook to access connectivity state.
 */
export function useConnectivity(): ConnectivityState {
  return useContext(ConnectivityContext);
}
