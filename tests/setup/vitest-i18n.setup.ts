import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import uk from '../../i18n/locales/uk.json';

/**
 * Sync i18n for unit tests so lib formatters and hooks can call i18n.t() / useTranslation.
 */
if (!i18n.isInitialized) {
  await i18n.use(initReactI18next).init({
    lng: 'uk',
    fallbackLng: 'uk',
    resources: { uk: { translation: uk } },
    compatibilityJSON: 'v4',
    interpolation: { escapeValue: false },
  });
}
