export type ConnectivityRouteParams = {
  from?: string;
};

/** Route rule plus optional screen override (`null` = defer to route). */
export function resolveConnectivityMonitoringEnabled(
  routeMonitoring: boolean,
  scopeOverride: boolean | null,
): boolean {
  return scopeOverride ?? routeMonitoring;
}

/**
 * Whether device/RTDB connectivity should be monitored for the current route.
 * Play screen uses {@link useRegisterConnectivityMonitoring} when opponents join.
 * Setup (home path) opts in only after the player taps «Змагання».
 */
export function routeRequiresConnectivityMonitoring(
  pathname: string,
  params?: ConnectivityRouteParams,
): boolean {
  if (/^\/online\/solo\//.test(pathname) || /^\/online\/solo-results\//.test(pathname)) {
    return false;
  }
  if (pathname === '/online/join' || pathname === '/online/browse') {
    return true;
  }
  if (pathname === '/online/setup' && params?.from === 'lobby') {
    return true;
  }
  if (/^\/online\/lobby\//.test(pathname)) {
    return true;
  }
  if (/^\/online\/pick-word\//.test(pathname)) {
    return true;
  }
  if (/^\/online\/results\//.test(pathname)) {
    return true;
  }
  if (/^\/online\/left\//.test(pathname)) {
    return true;
  }
  return false;
}
