const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { resolveAppCheckProduction } = require('./resolve-app-check-production.cjs');

/** Embed Firebase Web config in `expo.extra` for native builds (`expo-constants`). */
module.exports = function withFirebaseExtra(config) {
  return {
    ...config,
    extra: {
      ...(config.extra ?? {}),
      firebaseApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
      firebaseAuthDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
      firebaseDatabaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL ?? '',
      firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
      firebaseStorageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
      firebaseMessagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
      firebaseAppIdAndroid: process.env.EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID?.trim() || '',
      firebaseAppIdIos: process.env.EXPO_PUBLIC_FIREBASE_APP_ID_IOS?.trim() || '',
      firebaseMeasurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim() || '',
      firebaseAppCheckProduction: resolveAppCheckProduction(),
    },
  };
};
