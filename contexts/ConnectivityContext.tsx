import { useGlobalSearchParams, usePathname } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useNetworkConnectivity } from '@/hooks/useNetworkConnectivity';
import { useRtdbConnected } from '@/hooks/useRtdbConnected';
import {
  resolveConnectivityMonitoringEnabled,
  routeRequiresConnectivityMonitoring,
  type ConnectivityRouteParams,
} from '@/lib/online/connectivity-scope';

export type ConnectivityState = {
  /** Device has network and RTDB socket is up — safe to submit online words. */
  isOnline: boolean;
  deviceConnected: boolean;
  rtdbConnected: boolean;
  /** True when NetInfo / RTDB listeners are active for the current screen. */
  monitoringEnabled: boolean;
};

type ConnectivityScopeOverrideContextValue = {
  setOverride: (enabled: boolean | null) => void;
};

const ConnectivityContext = createContext<ConnectivityState>({
  isOnline: true,
  deviceConnected: true,
  rtdbConnected: true,
  monitoringEnabled: false,
});

const ConnectivityScopeOverrideContext = createContext<ConnectivityScopeOverrideContextValue>({
  setOverride: () => {},
});

/** First value when Expo passes a string or string[]. */
function firstSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/** Normalize Expo search params for connectivity route rules. */
function connectivityRouteParams(
  params: Record<string, string | string[] | undefined>,
): ConnectivityRouteParams {
  return { from: firstSearchParam(params.from) };
}

/**
 * Provide connectivity state to the app.
 */
export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useGlobalSearchParams();
  const [scopeOverride, setScopeOverride] = useState<boolean | null>(null);
  const routeMonitoring = routeRequiresConnectivityMonitoring(
    pathname,
    connectivityRouteParams(searchParams),
  );
  const monitoringEnabled = resolveConnectivityMonitoringEnabled(routeMonitoring, scopeOverride);

  const { isConnected: deviceConnected } = useNetworkConnectivity(monitoringEnabled);
  const rtdbConnected = useRtdbConnected(monitoringEnabled);
  const value = useMemo(
    () => ({
      isOnline: !monitoringEnabled || (deviceConnected && rtdbConnected),
      deviceConnected: !monitoringEnabled || deviceConnected,
      rtdbConnected: !monitoringEnabled || rtdbConnected,
      monitoringEnabled,
    }),
    [deviceConnected, monitoringEnabled, rtdbConnected],
  );

  const overrideValue = useMemo(
    () => ({
      setOverride: setScopeOverride,
    }),
    [],
  );

  return (
    <ConnectivityScopeOverrideContext.Provider value={overrideValue}>
      <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>
    </ConnectivityScopeOverrideContext.Provider>
  );
}

/**
 * Hook to access connectivity state.
 */
export function useConnectivity(): ConnectivityState {
  return useContext(ConnectivityContext);
}

/**
 * Opt in to connectivity monitoring from screens that need it dynamically (e.g. play).
 * Pass `null` to defer to route rules (e.g. setup lobby edits).
 */
export function useRegisterConnectivityMonitoring(enabled: boolean | null): void {
  const { setOverride } = useContext(ConnectivityScopeOverrideContext);
  const setMonitoringOverride = useCallback(
    (next: boolean | null) => {
      setOverride(next);
    },
    [setOverride],
  );

  useEffect(() => {
    setMonitoringOverride(enabled);
    return () => {
      setMonitoringOverride(null);
    };
  }, [enabled, setMonitoringOverride]);
}
