/** Fixed GATT UUIDs for Wordreapers nearby archive sync (ADR-023 BLE path). */
export const NEARBY_BLE_SERVICE_UUID = '57520001-0000-1000-8000-00805f9b34fb';
/** Central → peripheral (Want / HaveAck chunk writes). */
export const NEARBY_BLE_RX_CHAR_UUID = '57520002-0000-1000-8000-00805f9b34fb';
/** Peripheral → central (Hello / Archives / ArchivesEnd notifies). */
export const NEARBY_BLE_TX_CHAR_UUID = '57520003-0000-1000-8000-00805f9b34fb';
