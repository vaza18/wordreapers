import { router } from 'expo-router';

import { useProfileStore } from '@/store/profile-store';

/**
 * Navigate to profile setup when incomplete; returns true if caller may continue.
 */
export function continueWithProfileOrRedirect(returnTo: string): boolean {
  const { hydrated, isComplete } = useProfileStore.getState();
  if (!hydrated) {
    return false;
  }
  if (!isComplete()) {
    router.push({ pathname: '/profile', params: { returnTo } });
    return false;
  }
  return true;
}
