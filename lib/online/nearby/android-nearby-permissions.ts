/**
 * Android runtime permissions for nearby **LAN** archive sync by API level.
 * UDP/TCP sockets do not require Bluetooth for this path.
 * `NEARBY_WIFI_DEVICES` exists only from API 33 — requesting it on 31/32 yields DENIED forever.
 */
export function androidNearbyLanPermissionList(apiLevel: number): string[] {
  if (!Number.isFinite(apiLevel)) {
    return [];
  }
  if (apiLevel >= 33) {
    return ['android.permission.NEARBY_WIFI_DEVICES'];
  }
  return [];
}

/**
 * Android runtime permissions for nearby **BLE GATT** host/client (API 31+).
 * Older APIs rely on location/legacy BT via the munim-bluetooth Expo plugin manifest entries.
 */
export function androidNearbyBlePermissionList(apiLevel: number): string[] {
  if (!Number.isFinite(apiLevel)) {
    return [];
  }
  if (apiLevel >= 31) {
    return [
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_ADVERTISE',
      'android.permission.BLUETOOTH_CONNECT',
    ];
  }
  return ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'];
}

/** Union of LAN + BLE runtime permissions (manifest / docs listing only — not an all-or-nothing gate). */
export function androidNearbyPermissionList(apiLevel: number): string[] {
  return [
    ...new Set([
      ...androidNearbyLanPermissionList(apiLevel),
      ...androidNearbyBlePermissionList(apiLevel),
    ]),
  ];
}

export type NearbyAndroidPermissionCapabilities = {
  lanAllowed: boolean;
  bleAllowed: boolean;
};

/**
 * Evaluate LAN and BLE permission results independently.
 * BT deny must not imply LAN deny (and vice versa).
 */
export function evaluateAndroidNearbyPermissionResults(
  apiLevel: number,
  results: Readonly<Record<string, string>>,
  grantedStatus = 'granted',
): NearbyAndroidPermissionCapabilities {
  const lanPerms = androidNearbyLanPermissionList(apiLevel);
  const blePerms = androidNearbyBlePermissionList(apiLevel);
  const lanAllowed =
    lanPerms.length === 0 || lanPerms.every((permission) => results[permission] === grantedStatus);
  const bleAllowed =
    blePerms.length === 0 || blePerms.every((permission) => results[permission] === grantedStatus);
  return { lanAllowed, bleAllowed };
}

export function nearbySyncAllowedFromCapabilities(
  caps: NearbyAndroidPermissionCapabilities,
): boolean {
  return caps.lanAllowed || caps.bleAllowed;
}
