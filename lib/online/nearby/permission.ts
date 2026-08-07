import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'wordreapers.nearbyArchiveSyncPermission';
const BLE_STORAGE_KEY = 'wordreapers.nearbyArchiveSyncBleAllowed';
const LAN_STORAGE_KEY = 'wordreapers.nearbyArchiveSyncLanAllowed';

export type NearbyArchiveSyncPermission = 'unknown' | 'granted' | 'denied' | 'os-pending';

/**
 * BLE capability tri-state (persisted):
 * - `unknown` — not yet confirmed (iOS pending / missing key / LAN-only OS request)
 * - `allowed` — real BLE host/fetch confirmed (or Android BT granted)
 * - `denied` — explicit BT deny; probe must never reopen BLE
 */
export type NearbyBleCapabilityState = 'unknown' | 'allowed' | 'denied';

export type NearbyOsPermissionRequestResult = {
  /**
   * True when at least one nearby path is usable (LAN and/or BLE).
   * Never false solely because Bluetooth was denied while LAN remains possible.
   */
  granted: boolean;
  /** LAN UDP/TCP path allowed (Android); omitted on iOS pending. */
  lanAllowed?: boolean;
  /**
   * BLE GATT path: `true` = allowed, `false` = explicit deny after BT was requested.
   * Omit when BLE was not evaluated (LAN-only OS / iOS pending) so state stays `unknown`.
   */
  bleAllowed?: boolean;
  /**
   * iOS: Local Network / Bluetooth dialogs fire on first nearby use.
   * Persist `os-pending` instead of `granted` until a nearby op succeeds.
   */
  pendingOsConfirmation?: boolean;
};

let memoryCache: NearbyArchiveSyncPermission | null = null;
let bleMemoryCache: NearbyBleCapabilityState | null = null;
let lanMemoryCache: boolean | null = null;

export async function getNearbyArchiveSyncPermission(): Promise<NearbyArchiveSyncPermission> {
  if (memoryCache) {
    return memoryCache;
  }
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw === 'granted' || raw === 'denied' || raw === 'unknown' || raw === 'os-pending') {
    memoryCache = raw;
    return raw;
  }
  memoryCache = 'unknown';
  return 'unknown';
}

export async function setNearbyArchiveSyncPermission(
  value: NearbyArchiveSyncPermission,
): Promise<void> {
  memoryCache = value;
  await AsyncStorage.setItem(STORAGE_KEY, value);
}

async function migrateMissingLanCapabilityKey(): Promise<boolean> {
  const status = memoryCache ?? (await AsyncStorage.getItem(STORAGE_KEY));
  if (status === 'granted' || status === 'os-pending') {
    lanMemoryCache = true;
    await AsyncStorage.setItem(LAN_STORAGE_KEY, '1');
    return true;
  }
  lanMemoryCache = false;
  return false;
}

/**
 * Pre-split installs had `granted` without a BLE key. Leave `unknown` (do not write
 * denied `'0'`) so lobby/join may still probe; play still skips BLE until `allowed`.
 */
function migrateMissingBleCapabilityKey(): NearbyBleCapabilityState {
  bleMemoryCache = 'unknown';
  return 'unknown';
}

function bleStateFromStorageRaw(raw: string | null): NearbyBleCapabilityState {
  if (raw === '1') {
    return 'allowed';
  }
  if (raw === '0') {
    return 'denied';
  }
  return 'unknown';
}

export async function getNearbyBleCapabilityState(): Promise<NearbyBleCapabilityState> {
  if (bleMemoryCache !== null) {
    return bleMemoryCache;
  }
  const raw = await AsyncStorage.getItem(BLE_STORAGE_KEY);
  if (raw === '1' || raw === '0') {
    bleMemoryCache = bleStateFromStorageRaw(raw);
    return bleMemoryCache;
  }
  return migrateMissingBleCapabilityKey();
}

/** True only when BLE is explicitly allowed (not unknown / denied). */
export async function getNearbyBleCapabilityAllowed(): Promise<boolean> {
  return (await getNearbyBleCapabilityState()) === 'allowed';
}

export async function getNearbyLanCapabilityAllowed(): Promise<boolean> {
  if (lanMemoryCache !== null) {
    return lanMemoryCache;
  }
  const raw = await AsyncStorage.getItem(LAN_STORAGE_KEY);
  if (raw === '1') {
    lanMemoryCache = true;
    return true;
  }
  if (raw === '0') {
    lanMemoryCache = false;
    return false;
  }
  return migrateMissingLanCapabilityKey();
}

/** Sync read for transport gates (populated after ensure / set / hydrate). */
export function isNearbyBleCapabilityAllowedSync(): boolean {
  return bleMemoryCache === 'allowed';
}

/** Explicit BT deny — probe must not reopen BLE. */
export function isNearbyBleCapabilityDeniedSync(): boolean {
  return bleMemoryCache === 'denied';
}

export function isNearbyLanCapabilityAllowedSync(): boolean {
  // Default true until explicitly denied — LAN is the primary path.
  return lanMemoryCache !== false;
}

export async function setNearbyBleCapabilityAllowed(value: boolean): Promise<void> {
  bleMemoryCache = value ? 'allowed' : 'denied';
  await AsyncStorage.setItem(BLE_STORAGE_KEY, value ? '1' : '0');
}

export async function setNearbyLanCapabilityAllowed(value: boolean): Promise<void> {
  lanMemoryCache = value;
  await AsyncStorage.setItem(LAN_STORAGE_KEY, value ? '1' : '0');
}

/** Load LAN/BLE capability flags from storage into sync memory (no OS prompt). */
export async function hydrateNearbyCapabilitiesFromStorage(): Promise<void> {
  await getNearbyBleCapabilityState();
  await getNearbyLanCapabilityAllowed();
}

/** After a successful nearby host/fetch, promote os-pending → granted. */
export async function markNearbyArchiveSyncGrantedAfterSuccess(): Promise<void> {
  const current = await getNearbyArchiveSyncPermission();
  if (current === 'os-pending' || current === 'unknown') {
    await setNearbyArchiveSyncPermission('granted');
  }
}

/** Test helper — clear in-memory caches. */
export function resetNearbyArchiveSyncPermissionCacheForTests(): void {
  memoryCache = null;
  bleMemoryCache = null;
  lanMemoryCache = null;
}

/**
 * Ensure we may use nearby sync/advertise (LAN and/or BLE).
 * Requests OS only when status is unknown; never re-prompts after denied.
 * iOS may stay on `os-pending` until {@link markNearbyArchiveSyncGrantedAfterSuccess}.
 * Bluetooth-only denial must not set global denied when LAN is still allowed.
 */
export async function ensureNearbyArchiveSyncAllowed(
  requestOsPermission: () => Promise<NearbyOsPermissionRequestResult>,
): Promise<boolean> {
  const current = await getNearbyArchiveSyncPermission();
  if (current === 'granted' || current === 'os-pending') {
    await getNearbyBleCapabilityState();
    await getNearbyLanCapabilityAllowed();
    return true;
  }
  if (current === 'denied') {
    return false;
  }
  const result = await requestOsPermission();
  if (!result.granted) {
    // Persist only axes that were evaluated. LAN-only fail must not deny BLE or
    // set global nearby `denied` (BLE was never requested).
    if (result.lanAllowed === false) {
      await setNearbyLanCapabilityAllowed(false);
    } else if (result.lanAllowed === true) {
      await setNearbyLanCapabilityAllowed(true);
    }
    if (result.bleAllowed === false) {
      await setNearbyBleCapabilityAllowed(false);
    } else if (result.bleAllowed === true) {
      await setNearbyBleCapabilityAllowed(true);
    }
    const bleWasEvaluated = result.bleAllowed !== undefined;
    const lanFailed = result.lanAllowed === false;
    const bleFailed = result.bleAllowed === false;
    if (bleWasEvaluated && lanFailed && bleFailed) {
      await setNearbyArchiveSyncPermission('denied');
    }
    return false;
  }
  const lanAllowed = result.lanAllowed ?? true;
  await setNearbyLanCapabilityAllowed(lanAllowed);
  // Tri-state: only persist BLE when explicitly evaluated (true/false).
  // Omit / pending → leave unknown so lobby may probe; do not write denied.
  if (result.bleAllowed === true) {
    await setNearbyBleCapabilityAllowed(true);
  } else if (result.bleAllowed === false && !result.pendingOsConfirmation) {
    await setNearbyBleCapabilityAllowed(false);
  } else {
    bleMemoryCache = 'unknown';
  }
  if (result.pendingOsConfirmation) {
    await setNearbyArchiveSyncPermission('os-pending');
    return true;
  }
  await setNearbyArchiveSyncPermission('granted');
  return true;
}
