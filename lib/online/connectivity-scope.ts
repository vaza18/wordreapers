export type ConnectivityRouteParams = {
  from?: string;
};

/**
 * Whether device/RTDB connectivity should be monitored for the current route.
 * Play screen uses {@link useRegisterConnectivityMonitoring} when opponents join.
 */
export function routeRequiresConnectivityMonitoring(
  pathname: string,
  params?: ConnectivityRouteParams,
): boolean {
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
