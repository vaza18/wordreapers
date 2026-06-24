const isProductionBuild =
  process.env.EAS_BUILD_PROFILE === 'production' || process.env.APP_VARIANT === 'production';

const devIosInfoPlist = {
  NSLocalNetworkUsageDescription:
    'Потрібен доступ до локальної мережі, щоб завантажувати код гри з компʼютера під час розробки.',
  NSBonjourServices: ['_metro._tcp'],
};

/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  const baseIosInfoPlist = { ...(config.ios?.infoPlist ?? {}) };

  if (isProductionBuild) {
    delete baseIosInfoPlist.NSLocalNetworkUsageDescription;
    delete baseIosInfoPlist.NSBonjourServices;
  } else {
    Object.assign(baseIosInfoPlist, devIosInfoPlist);
  }

  const plugins = [
    ...(config.plugins ?? []),
    './plugins/with-automatic-ui-style.cjs',
    './plugins/with-firebase-extra.cjs',
    './plugins/without-ios-push-entitlement.cjs',
  ];

  if (isProductionBuild) {
    plugins.push([
      'expo-build-properties',
      {
        android: {
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
      },
    ]);
  }

  if (!isProductionBuild) {
    plugins.push('./plugins/with-ios-device-metro-host.cjs');
  }

  return {
    ...config,
    name: isProductionBuild ? 'Wordreapers' : config.name,
    ios: {
      ...config.ios,
      userInterfaceStyle: 'automatic',
      infoPlist: baseIosInfoPlist,
    },
    android: {
      ...config.android,
      userInterfaceStyle: 'automatic',
    },
    plugins,
  };
};
