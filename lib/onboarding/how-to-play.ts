import AsyncStorage from '@react-native-async-storage/async-storage';

const HOW_TO_PLAY_SEEN_KEY = 'wordreapers.hasSeenHowToPlay';

/** Whether the first-run how-to-play dialog was dismissed on this device. */
export async function getHasSeenHowToPlay(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(HOW_TO_PLAY_SEEN_KEY);
  return raw === '1';
}

/** Persist that the how-to-play dialog was shown. */
export async function markHowToPlaySeen(): Promise<void> {
  await AsyncStorage.setItem(HOW_TO_PLAY_SEEN_KEY, '1');
}
