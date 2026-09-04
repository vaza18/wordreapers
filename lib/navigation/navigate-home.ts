import { router } from 'expo-router';

import { rtdbTrafficProbe } from '@/lib/debug/rtdb-traffic-probe';

/**
 * Navigate to home and drop intermediate routes so back cannot return to stale screens.
 */
export function navigateHomeClearingStack(): void {
  // ADR-025: explicit leave — flush sticky room before leaving online UI.
  rtdbTrafficProbe.setActiveRoomId(null);
  if (router.canDismiss()) {
    router.dismissTo('/');
    return;
  }
  router.replace('/');
}

/**
 * Navigate to home with a back-style (pop) transition when possible.
 */
export function navigateHomeWithBackAnimation(): void {
  // ADR-025: explicit leave — flush sticky room before leaving online UI.
  rtdbTrafficProbe.setActiveRoomId(null);
  if (router.canDismiss()) {
    router.dismissTo('/');
    return;
  }
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace('/');
}
