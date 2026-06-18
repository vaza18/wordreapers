import AsyncStorage from '@react-native-async-storage/async-storage';

import { LOCALE_STORAGE_KEY } from '@/i18n';
import { PROFILE_STORAGE_KEY } from '@/lib/profile/player-profile';
import { PLAYER_STATS_STORAGE_KEY } from '@/lib/profile/player-stats';
import { GAME_SETUP_STORAGE_KEY } from '@/lib/settings/game-setup-preferences';

const BUTTON_FEEDBACK_STORAGE_KEY = 'wordreapers.buttonFeedback';
const LEGACY_KEY_PRESS_FEEDBACK_STORAGE_KEY = 'wordreapers.keyPressFeedback';
const WORD_ACCEPTED_FEEDBACK_STORAGE_KEY = 'wordreapers.wordAcceptedFeedback';
const TIMER_ALERT_FEEDBACK_STORAGE_KEY = 'wordreapers.timerAlertFeedback';

const LOCAL_DATA_STORAGE_KEYS = [
  PROFILE_STORAGE_KEY,
  PLAYER_STATS_STORAGE_KEY,
  GAME_SETUP_STORAGE_KEY,
  BUTTON_FEEDBACK_STORAGE_KEY,
  LEGACY_KEY_PRESS_FEEDBACK_STORAGE_KEY,
  WORD_ACCEPTED_FEEDBACK_STORAGE_KEY,
  TIMER_ALERT_FEEDBACK_STORAGE_KEY,
  LOCALE_STORAGE_KEY,
] as const;

/**
 * Remove persisted profile, game setup, feedback, and locale from AsyncStorage.
 */
export async function clearLocalDataStorage(): Promise<void> {
  await Promise.all(LOCAL_DATA_STORAGE_KEYS.map((key) => AsyncStorage.removeItem(key)));
}
