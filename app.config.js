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
    ...(config.plugins ?? []).map((plugin) => {
      if (!isProductionBuild && plugin === 'expo-dev-client') {
        return ['expo-dev-client', { launchMode: 'launcher' }];
      }
      return plugin;
    }),
    './plugins/with-automatic-ui-style.cjs',
    './plugins/with-firebase-extra.cjs',
    './plugins/without-ios-push-entitlement.cjs',
    './plugins/with-ios-modular-headers.cjs',
    '@react-native-firebase/app',
    '@react-native-firebase/app-check',
    './plugins/with-ios-firebase-native-init.cjs',
    [
      'expo-build-properties',
      {
        ios: {
          useFrameworks: 'static',
          deploymentTarget: '15.1',
        },
        ...(isProductionBuild
          ? {
              android: {
                enableMinifyInReleaseBuilds: true,
                enableShrinkResourcesInReleaseBuilds: true,
              },
            }
          : {}),
      },
    ],
  ];

  if (!isProductionBuild) {
    plugins.push('./plugins/with-ios-device-metro-host.cjs');
  }

  return {
    ...config,
    name: isProductionBuild ? 'Wordreapers' : config.name,
    ios: {
      ...config.ios,
      userInterfaceStyle: 'automatic',
      googleServicesFile:
        process.env.GOOGLE_SERVICES_PLIST ??
        process.env.GOOGLE_SERVICE_INFO_PLIST ??
        config.ios?.googleServicesFile,
      infoPlist: baseIosInfoPlist,
    },
    android: {
      ...config.android,
      userInterfaceStyle: 'automatic',
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
    },
    plugins,
  };
};
