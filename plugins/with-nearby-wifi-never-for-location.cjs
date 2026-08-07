/**
 * Ensure NEARBY_WIFI_DEVICES carries android:usesPermissionFlags="neverForLocation"
 * so LAN nearby sync is not treated as a location capability (API 33+).
 */
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const PERMISSION = 'android.permission.NEARBY_WIFI_DEVICES';

function withNearbyWifiNeverForLocation(config) {
  return withAndroidManifest(config, (config) => {
    AndroidConfig.Manifest.ensureToolsAvailable(config.modResults);
    const manifest = config.modResults.manifest;
    if (!Array.isArray(manifest['uses-permission'])) {
      manifest['uses-permission'] = [];
    }
    const permissions = manifest['uses-permission'];
    const existing = permissions.find((entry) => entry?.$?.['android:name'] === PERMISSION);
    if (existing) {
      existing.$['android:usesPermissionFlags'] = 'neverForLocation';
      return config;
    }
    permissions.push({
      $: {
        'android:name': PERMISSION,
        'android:usesPermissionFlags': 'neverForLocation',
      },
    });
    return config;
  });
}

module.exports = withNearbyWifiNeverForLocation;
