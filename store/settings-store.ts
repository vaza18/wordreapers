import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { AppLocale } from '@/i18n';
import type { UniqueBonusMode } from '@/lib/game/scoring';
import {
  DEFAULT_GAME_SETUP_PREFERENCES,
  GAME_SETUP_STORAGE_KEY,
  parseGameSetupPreferences,
  type GameSetupPreferences,
} from '@/lib/settings/game-setup-preferences';
import {
  APPEARANCE_MODE_STORAGE_KEY,
  DEFAULT_APPEARANCE_MODE,
  parseAppearanceMode,
  type AppearanceMode,
} from '@/lib/settings/appearance-mode';
import {
  DEFAULT_BUTTON_FEEDBACK,
  DEFAULT_TIMER_ALERT_FEEDBACK,
  DEFAULT_WORD_ACCEPTED_FEEDBACK,
  parseFeedbackMode,
  type FeedbackMode,
} from '@/lib/settings/feedback-mode';

const BUTTON_FEEDBACK_STORAGE_KEY = 'wordreapers.buttonFeedback';
const LEGACY_KEY_PRESS_FEEDBACK_STORAGE_KEY = 'wordreapers.keyPressFeedback';
const WORD_ACCEPTED_FEEDBACK_STORAGE_KEY = 'wordreapers.wordAcceptedFeedback';
const TIMER_ALERT_FEEDBACK_STORAGE_KEY = 'wordreapers.timerAlertFeedback';

async function loadFeedbackPreferences(): Promise<{
  buttonFeedback: FeedbackMode;
  wordAcceptedFeedback: FeedbackMode;
  timerAlertMode: FeedbackMode;
}> {
  const [buttonRaw, legacyKeyPressRaw, wordAcceptedRaw, timerAlertRaw] = await Promise.all([
    AsyncStorage.getItem(BUTTON_FEEDBACK_STORAGE_KEY),
    AsyncStorage.getItem(LEGACY_KEY_PRESS_FEEDBACK_STORAGE_KEY),
    AsyncStorage.getItem(WORD_ACCEPTED_FEEDBACK_STORAGE_KEY),
    AsyncStorage.getItem(TIMER_ALERT_FEEDBACK_STORAGE_KEY),
  ]);

  const buttonFeedback = parseFeedbackMode(buttonRaw ?? legacyKeyPressRaw, DEFAULT_BUTTON_FEEDBACK);

  return {
    buttonFeedback,
    wordAcceptedFeedback: parseFeedbackMode(wordAcceptedRaw, DEFAULT_WORD_ACCEPTED_FEEDBACK),
    timerAlertMode: parseFeedbackMode(timerAlertRaw, DEFAULT_TIMER_ALERT_FEEDBACK),
  };
}

async function saveFeedbackPreference(
  key: 'button' | 'wordAccepted' | 'timerAlert',
  mode: FeedbackMode,
): Promise<void> {
  const storageKey =
    key === 'button'
      ? BUTTON_FEEDBACK_STORAGE_KEY
      : key === 'wordAccepted'
        ? WORD_ACCEPTED_FEEDBACK_STORAGE_KEY
        : TIMER_ALERT_FEEDBACK_STORAGE_KEY;
  await AsyncStorage.setItem(storageKey, mode);
}

async function persistGameSetup(preferences: GameSetupPreferences): Promise<void> {
  await AsyncStorage.setItem(GAME_SETUP_STORAGE_KEY, JSON.stringify(preferences));
}

/** App-wide preferences persisted via AsyncStorage. */
export interface SettingsState {
  locale: AppLocale;
  appearanceMode: AppearanceMode;
  buttonFeedback: FeedbackMode;
  wordAcceptedFeedback: FeedbackMode;
  timerAlertMode: FeedbackMode;
  gameSetup: GameSetupPreferences;
  setLocale: (locale: AppLocale) => void;
  setAppearanceMode: (mode: AppearanceMode) => void;
  setButtonFeedback: (mode: FeedbackMode) => void;
  setWordAcceptedFeedback: (mode: FeedbackMode) => void;
  setTimerAlertMode: (mode: FeedbackMode) => void;
  setGameSetupDuration: (durationMinutes: number) => void;
  setGameSetupUniqueBonusMode: (uniqueBonusMode: UniqueBonusMode) => void;
  setGameSetupAllowProperNouns: (allow: boolean) => void;
  setGameSetupAllowSlang: (allow: boolean) => void;
  hydrateAppearancePreference: () => Promise<void>;
  hydrateFeedbackPreferences: () => Promise<void>;
  hydrateGameSetupPreferences: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  locale: 'uk',
  appearanceMode: DEFAULT_APPEARANCE_MODE,
  buttonFeedback: DEFAULT_BUTTON_FEEDBACK,
  wordAcceptedFeedback: DEFAULT_WORD_ACCEPTED_FEEDBACK,
  timerAlertMode: DEFAULT_TIMER_ALERT_FEEDBACK,
  gameSetup: DEFAULT_GAME_SETUP_PREFERENCES,

  setLocale: (locale) => {
    set({ locale });
  },

  setAppearanceMode: (mode) => {
    set({ appearanceMode: mode });
    void AsyncStorage.setItem(APPEARANCE_MODE_STORAGE_KEY, mode);
  },

  setButtonFeedback: (mode) => {
    set({ buttonFeedback: mode });
    void saveFeedbackPreference('button', mode);
  },

  setWordAcceptedFeedback: (mode) => {
    set({ wordAcceptedFeedback: mode });
    void saveFeedbackPreference('wordAccepted', mode);
  },

  setTimerAlertMode: (mode) => {
    set({ timerAlertMode: mode });
    void saveFeedbackPreference('timerAlert', mode);
  },

  setGameSetupDuration: (durationMinutes) => {
    const gameSetup = { ...get().gameSetup, durationMinutes };
    set({ gameSetup });
    void persistGameSetup(gameSetup);
  },

  setGameSetupUniqueBonusMode: (uniqueBonusMode) => {
    const gameSetup = { ...get().gameSetup, uniqueBonusMode };
    set({ gameSetup });
    void persistGameSetup(gameSetup);
  },

  setGameSetupAllowProperNouns: (allowProperNouns) => {
    const gameSetup = { ...get().gameSetup, allowProperNouns };
    set({ gameSetup });
    void persistGameSetup(gameSetup);
  },

  setGameSetupAllowSlang: (allowSlang) => {
    const gameSetup = { ...get().gameSetup, allowSlang };
    set({ gameSetup });
    void persistGameSetup(gameSetup);
  },

  hydrateAppearancePreference: async () => {
    const raw = await AsyncStorage.getItem(APPEARANCE_MODE_STORAGE_KEY);
    set({ appearanceMode: parseAppearanceMode(raw) });
  },

  hydrateFeedbackPreferences: async () => {
    const prefs = await loadFeedbackPreferences();
    set({
      buttonFeedback: prefs.buttonFeedback,
      wordAcceptedFeedback: prefs.wordAcceptedFeedback,
      timerAlertMode: prefs.timerAlertMode,
    });
  },

  hydrateGameSetupPreferences: async () => {
    const raw = await AsyncStorage.getItem(GAME_SETUP_STORAGE_KEY);
    set({ gameSetup: parseGameSetupPreferences(raw) });
  },
}));
