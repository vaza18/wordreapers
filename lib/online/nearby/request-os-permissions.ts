import { Platform } from 'react-native';
import { PermissionsAndroid } from 'react-native';

import type { NearbyOsPermissionRequestResult } from './permission.js';
import {
  androidNearbyBlePermissionList,
  androidNearbyLanPermissionList,
  evaluateAndroidNearbyPermissionResults,
  nearbySyncAllowedFromCapabilities,
} from './android-nearby-permissions.js';

type AndroidPermission =
  (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS];

export type NearbyOsPermissionRequestOptions = {
  /**
   * When false, request LAN only — never munim/BT strings; omit `bleAllowed`
   * so capability stays `unknown` (not denied). Used for play QR.
   */
  includeBle?: boolean;
};

async function requestAndroidPermissionSubset(
  permissions: string[],
): Promise<Record<string, string>> {
  if (permissions.length === 0) {
    return {};
  }
  try {
    const result = await PermissionsAndroid.requestMultiple(permissions as AndroidPermission[]);
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(result)) {
      out[key] = String(value);
    }
    return out;
  } catch {
    const out: Record<string, string> = {};
    for (const permission of permissions) {
      out[permission] = PermissionsAndroid.RESULTS.DENIED;
    }
    return out;
  }
}

/**
 * One-shot OS permission request for nearby sync.
 * LAN and BLE are evaluated independently — BT deny must not block LAN.
 * iOS: Local Network / Bluetooth dialogs fire on first use — pending until success.
 */
export async function requestNearbyOsPermissions(
  options?: NearbyOsPermissionRequestOptions,
): Promise<NearbyOsPermissionRequestResult> {
  const includeBle = options?.includeBle !== false;
  if (Platform.OS === 'web') {
    return { granted: false, lanAllowed: false, bleAllowed: false };
  }
  if (Platform.OS === 'android') {
    const api = typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
    const lanList = androidNearbyLanPermissionList(api);
    const lanResults = await requestAndroidPermissionSubset(lanList);

    if (!includeBle) {
      const lanOnly = evaluateAndroidNearbyPermissionResults(
        api,
        lanResults,
        PermissionsAndroid.RESULTS.GRANTED,
      );
      return {
        granted: lanOnly.lanAllowed,
        lanAllowed: lanOnly.lanAllowed,
        // Omit bleAllowed — BLE not evaluated; keep capability `unknown`.
      };
    }

    const bleList = androidNearbyBlePermissionList(api);
    let bleResults: Record<string, string> = {};
    let munimBleOk: boolean | null = null;
    try {
      const munim = require('munim-bluetooth') as {
        requestBluetoothPermission?: (
          caps?: Array<'scan' | 'connect' | 'advertise'>,
        ) => Promise<boolean>;
      };
      if (typeof munim.requestBluetoothPermission === 'function') {
        try {
          munimBleOk = await munim.requestBluetoothPermission(['scan', 'connect', 'advertise']);
        } catch {
          munimBleOk = false;
        }
      }
    } catch {
      // munim not linked — fall through to PermissionsAndroid for BLE strings.
    }

    if (munimBleOk === true) {
      for (const permission of bleList) {
        bleResults[permission] = PermissionsAndroid.RESULTS.GRANTED;
      }
    } else if (munimBleOk === false) {
      for (const permission of bleList) {
        bleResults[permission] = PermissionsAndroid.RESULTS.DENIED;
      }
    } else {
      bleResults = await requestAndroidPermissionSubset(bleList);
    }

    const caps = evaluateAndroidNearbyPermissionResults(
      api,
      {
        ...lanResults,
        ...bleResults,
      },
      PermissionsAndroid.RESULTS.GRANTED,
    );

    return {
      granted: nearbySyncAllowedFromCapabilities(caps),
      lanAllowed: caps.lanAllowed,
      bleAllowed: caps.bleAllowed,
    };
  }
  // iOS: Local Network + Bluetooth prompts fire on first socket/BLE use.
  // Omit bleAllowed (unknown) until a real BLE host/fetch succeeds — otherwise
  // writing denied would block lobby probe, and writing allowed would let play
  // hydrate into BLE and show a mid-round OS BT dialog.
  return {
    granted: true,
    lanAllowed: true,
    pendingOsConfirmation: true,
  };
}
