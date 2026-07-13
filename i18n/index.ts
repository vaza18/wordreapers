import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import uk from './locales/uk.json';

export const LOCALE_STORAGE_KEY = 'wordreapers.locale';
export const SUPPORTED_LOCALES = ['uk'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

const resources = {
  uk: { translation: uk },
};

function resolveDeviceLocale(): AppLocale {
  const code = Localization.getLocales()[0]?.languageCode?.toLowerCase();
  if (code === 'uk') {
    return 'uk';
  }
  return 'uk';
}

let initialized = false;

/**
 * Initialize i18n once at app startup (device locale, persisted override).
 */
export async function initI18n(): Promise<typeof i18n> {
  if (initialized) {
    return i18n;
  }
  // Lib/tests may have already bootstrapped resources; still attach react-i18next once.
  if (i18n.isInitialized) {
    initialized = true;
    return i18n;
  }

  const stored = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
  const initialLocale =
    stored && SUPPORTED_LOCALES.includes(stored as AppLocale)
      ? (stored as AppLocale)
      : resolveDeviceLocale();

  await i18n.use(initReactI18next).init({
    resources,
    lng: initialLocale,
    fallbackLng: 'uk',
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v4',
  });

  initialized = true;
  return i18n;
}

/**
 * Change UI locale (MVP: only Ukrainian is listed).
 */
export async function setAppLocale(locale: AppLocale): Promise<void> {
  await i18n.changeLanguage(locale);
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

export default i18n;
