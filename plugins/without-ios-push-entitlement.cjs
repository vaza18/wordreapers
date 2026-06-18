const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Remove aps-environment so free Apple personal teams can sign device builds.
 * The app uses local notifications only (scheduleNotificationAsync), not remote push.
 * Set EXPO_IOS_ENABLE_PUSH=1 when building with a paid team that needs remote push.
 */
module.exports = function withoutIosPushEntitlement(config) {
  if (process.env.EXPO_IOS_ENABLE_PUSH === '1') {
    return config;
  }

  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
