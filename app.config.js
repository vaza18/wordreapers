const appJson = require('./app.json');

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    ...appJson.expo,
    plugins: [
      ...(appJson.expo.plugins ?? []),
      './plugins/with-firebase-extra.cjs',
      './plugins/without-ios-push-entitlement.cjs',
      './plugins/with-ios-device-metro-host.cjs',
    ],
  },
};
