import { router } from 'expo-router';

/**
 * Navigate to home with a back-style (pop) transition when possible.
 */
export function navigateHomeWithBackAnimation(): void {
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
