const appJson = require('./app.json');

const isProductionBuild =
  process.env.EAS_BUILD_PROFILE === 'production' || process.env.APP_VARIANT === 'production';

const devIosInfoPlist = {
  NSLocalNetworkUsageDescription:
    'Потрібен доступ до локальної мережі, щоб завантажувати код гри з компʼютера під час розробки.',
  NSBonjourServices: ['_metro._tcp'],
};

const baseIosInfoPlist = { ...(appJson.expo.ios?.infoPlist ?? {}) };

if (isProductionBuild) {
  delete baseIosInfoPlist.NSLocalNetworkUsageDescription;
  delete baseIosInfoPlist.NSBonjourServices;
} else {
  Object.assign(baseIosInfoPlist, devIosInfoPlist);
}

const plugins = [
  ...(appJson.expo.plugins ?? []),
  './plugins/with-firebase-extra.cjs',
  './plugins/without-ios-push-entitlement.cjs',
];

if (!isProductionBuild) {
  plugins.push('./plugins/with-ios-device-metro-host.cjs');
}

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    ...appJson.expo,
    name: isProductionBuild ? 'Wordreapers' : appJson.expo.name,
    ios: {
      ...appJson.expo.ios,
      infoPlist: baseIosInfoPlist,
    },
    plugins,
  },
};
