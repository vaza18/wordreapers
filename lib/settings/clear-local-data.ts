import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearRoundPlayableLexiconCache } from '@/lib/dictionary/round-playable-lexicon-cache';
import { signOutFirebaseAuth } from '@/lib/firebase/auth';
import { useRtdbDiagnosticsStore } from '@/store/rtdb-diagnostics-store';
import { rtdbTrafficProbe } from '@/lib/debug/rtdb-traffic-probe';
import { WORDREAPERS_STORAGE_PREFIX } from '@/constants/storage';

/**
 * Remove persisted Wordreapers app data and the local Firebase Auth session.
 * Server-side RTDB rows for the old anonymous uid are not deleted.
 */
export async function clearLocalDataStorage(): Promise<void> {
  useRtdbDiagnosticsStore.getState().reset();
  rtdbTrafficProbe.reset();
  const keys = await AsyncStorage.getAllKeys();
  const localKeys = keys.filter((key) => key.startsWith(WORDREAPERS_STORAGE_PREFIX));
  if (localKeys.length > 0) {
    await AsyncStorage.multiRemove(localKeys);
  }
  clearRoundPlayableLexiconCache();
  await signOutFirebaseAuth();
}
