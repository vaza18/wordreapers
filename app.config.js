const isProductionBuild =
  process.env.EAS_BUILD_PROFILE === 'production' || process.env.APP_VARIANT === 'production';

const nearbyIosInfoPlist = {
  // LAN + BLE nearby sync (ADR-023): Local Network for UDP/TCP; Bluetooth for GATT fallback.
  NSLocalNetworkUsageDescription:
    'Потрібен доступ до локальної мережі, щоб підтягнути пропущені раунди історії кімнати від гравців поруч.',
  NSBluetoothAlwaysUsageDescription:
    'Bluetooth використовується, щоб знайти гравців поруч і синхронізувати історію раундів кімнати, коли немає спільної Wi‑Fi.',
  NSBluetoothPeripheralUsageDescription:
    'Bluetooth використовується, щоб поділитися історією раундів кімнати з гравцями поруч без спільної Wi‑Fi.',
};

const devIosInfoPlist = {
  NSLocalNetworkUsageDescription:
    'Потрібен доступ до локальної мережі для Metro під час розробки та для синхронізації історії раундів з гравцями поруч.',
  NSBonjourServices: ['_metro._tcp'],
};

/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  const baseIosInfoPlist = { ...(config.ios?.infoPlist ?? {}) };

  Object.assign(baseIosInfoPlist, nearbyIosInfoPlist);
  if (!isProductionBuild) {
    Object.assign(baseIosInfoPlist, devIosInfoPlist);
  }

  const plugins = [
    ...(config.plugins ?? [])
      .filter((plugin) => !(isProductionBuild && plugin === 'expo-dev-client'))
      .map((plugin) => {
        if (!isProductionBuild && plugin === 'expo-dev-client') {
          return ['expo-dev-client', { launchMode: 'launcher' }];
        }
        return plugin;
      }),
    './plugins/with-automatic-ui-style.cjs',
    './plugins/with-agp-version-patch.cjs',
    './plugins/with-firebase-extra.cjs',
    './plugins/without-ios-push-entitlement.cjs',
    './plugins/with-ios-modular-headers.cjs',
    './plugins/with-nearby-wifi-never-for-location.cjs',
    // Must be listed *before* RNFB plugins: Expo dangerous mods run last-registered first,
    // so this plugin's strip/replace of App Check Swift init runs after RNFB writes it.
    './plugins/with-ios-firebase-native-init.cjs',
    '@react-native-firebase/app',
    '@react-native-firebase/app-check',
    [
      'expo-build-properties',
      {
        ios: {
          useFrameworks: 'static',
          deploymentTarget: '16.4',
          forceStaticLinking: ['RNFBApp', 'RNFBAppCheck'],
        },
        android: {
          // Java 25 requires --enable-native-access=ALL-UNNAMED for JNI/CMake
          gradleJvmArgs: '-Xmx4g -XX:MaxMetaspaceSize=1g --enable-native-access=ALL-UNNAMED',
          ...(isProductionBuild
            ? {
                enableMinifyInReleaseBuilds: true,
                enableShrinkResourcesInReleaseBuilds: true,
              }
            : {}),
        },
      },
    ],
    [
      'munim-bluetooth',
      {
        // Foreground nearby sync only — no Multipeer Bonjour service types.
        multipeerServiceTypes: false,
        bluetoothBackground: false,
        androidBluetoothPermissions: ['scan', 'connect', 'advertise'],
        bluetoothAlwaysUsageDescription:
          'Bluetooth використовується, щоб знайти гравців поруч і синхронізувати історію раундів кімнати, коли немає спільної Wi‑Fi.',
        bluetoothPeripheralUsageDescription:
          'Bluetooth використовується, щоб поділитися історією раундів кімнати з гравцями поруч без спільної Wi‑Fi.',
      },
    ],
  ];

  if (isProductionBuild) {
    plugins.push('./plugins/with-android-r8-optimizations.cjs');
  }

  if (!isProductionBuild) {
    plugins.push('./plugins/with-ios-device-metro-host.cjs');
  }

  // Production default home-screen name is English «Wordreapers».
  // Ukrainian OS language uses locales.uk → «Словозбирачі» (see locales/app-metadata/uk.json).
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
      permissions: [
        ...new Set([
          ...((config.android && config.android.permissions) || []),
          'android.permission.ACCESS_NETWORK_STATE',
          'android.permission.CHANGE_WIFI_MULTICAST_STATE',
          // LAN + BLE nearby archive sync (ADR-023).
          // Flag neverForLocation applied via plugins/with-nearby-wifi-never-for-location.cjs
          'android.permission.NEARBY_WIFI_DEVICES',
          'android.permission.BLUETOOTH',
          'android.permission.BLUETOOTH_ADMIN',
          'android.permission.BLUETOOTH_SCAN',
          'android.permission.BLUETOOTH_ADVERTISE',
          'android.permission.BLUETOOTH_CONNECT',
          // Legacy BLE discovery (API < 31) — must match androidNearbyBlePermissionList.
          'android.permission.ACCESS_FINE_LOCATION',
          'android.permission.ACCESS_COARSE_LOCATION',
        ]),
      ],
    },
    plugins,
  };
};
