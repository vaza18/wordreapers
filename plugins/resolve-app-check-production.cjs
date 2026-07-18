/**
 * Only `EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION` drives the baked / runtime flag.
 * Never fall back to APP_VARIANT / EAS_BUILD_PROFILE.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
function resolveAppCheckProduction(env = process.env) {
  return env.EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION?.trim() === 'true';
}

module.exports = { resolveAppCheckProduction };
