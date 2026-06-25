import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearRoundPlayableLexiconCache } from '@/lib/dictionary/round-playable-lexicon-cache';
import { signOutFirebaseAuth } from '@/lib/firebase/auth';

/** Prefix for all Wordreapers-owned AsyncStorage keys (excludes Firebase Auth persistence). */
export const WORDREAPERS_STORAGE_PREFIX = 'wordreapers.';

/**
 * Remove persisted Wordreapers app data and the local Firebase Auth session.
 * Server-side RTDB rows for the old anonymous uid are not deleted.
 */
export async function clearLocalDataStorage(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const localKeys = keys.filter((key) => key.startsWith(WORDREAPERS_STORAGE_PREFIX));
  if (localKeys.length > 0) {
    await AsyncStorage.multiRemove(localKeys);
  }
  clearRoundPlayableLexiconCache();
  await signOutFirebaseAuth();
}
