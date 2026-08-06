import { Platform } from 'react-native';

import { normalizeRoomCode } from '../../firebase/room-code.js';
import { devLogAction } from '../../debug/dev-log.js';
import type { FinishedRoundArchive } from '../session/online-session-archive.js';

import {
  chunkUtf8Payload,
  createBleChunkAssembler,
  encodeBleGattChunkHex,
} from './ble-gatt-framing.js';
import {
  NEARBY_BLE_RX_CHAR_UUID,
  NEARBY_BLE_SERVICE_UUID,
  NEARBY_BLE_TX_CHAR_UUID,
} from './ble-uuids.js';
import { clientHaveAckRoundsFromReceived, hostTrustedHaveAckRounds } from './have-ack-rounds.js';
import type {
  NearbyArchiveTransport,
  NearbyFetchMissingInput,
  NearbyFetchMissingResult,
  NearbyHostHandlers,
} from './nearby-archive-transport.js';
import { isNearbyHostApplyTokenActive } from './nearby-archive-transport.js';
import { setNearbyBleCapabilityAllowed } from './permission.js';
import {
  createArchivesEndMessage,
  createHaveAckMessage,
  createHelloMessage,
  createWantMessage,
  isAuthorizedNearbyRequester,
  parseNearbyProtocolMessage,
  type NearbyProtocolMessage,
} from './protocol.js';
import { normalizeHaveRounds } from './missing-round-archives.js';
import {
  isPeerArchiveWithinWireLimit,
  isValidPeerArchiveShape,
  stripArchiveForTransfer,
} from './strip-archive.js';
import { shouldTrustTcpHaveAck } from './tcp-have-ack-trust.js';
import { sanitizeWantRounds } from './want-rounds.js';

export type MunimBleApi = {
  isBluetoothEnabled?: () => Promise<boolean>;
  setServices: (
    services: Array<{
      uuid: string;
      characteristics: Array<{ uuid: string; properties: string[]; value?: string }>;
    }>,
  ) => void;
  startAdvertising: (options: { serviceUUIDs: string[]; localName?: string }) => void;
  stopAdvertising: () => void;
  updateCharacteristicValue: (
    serviceUUID: string,
    characteristicUUID: string,
    value: string,
    notify?: boolean,
  ) => Promise<void>;
  startScan: (options?: { serviceUUIDs?: string[]; allowDuplicates?: boolean }) => void;
  stopScan: () => void;
  connect: (deviceId: string) => Promise<void>;
  disconnect: (deviceId: string) => void;
  discoverServices: (deviceId: string) => Promise<unknown>;
  writeCharacteristic: (
    deviceId: string,
    serviceUUID: string,
    characteristicUUID: string,
    value: string,
    writeType?: 'write' | 'writeWithoutResponse',
  ) => Promise<void>;
  subscribeToCharacteristic: (
    deviceId: string,
    serviceUUID: string,
    characteristicUUID: string,
  ) => void;
  unsubscribeFromCharacteristic?: (
    deviceId: string,
    serviceUUID: string,
    characteristicUUID: string,
  ) => void;
  addEventListener: (eventName: string, callback: (data: unknown) => void) => () => void;
};

type BlePeripheralSubscribeEvent = {
  centralId: string;
  characteristicUUID: string;
};

type BlePeripheralWriteEvent = {
  centralId: string;
  characteristicUUID: string;
  value: string;
};

type BleDeviceFoundEvent = {
  id: string;
};

type BleCharacteristicValueEvent = {
  deviceId: string;
  characteristicUUID: string;
  value: string;
};

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
}

function parsePeripheralSubscribe(data: unknown): BlePeripheralSubscribeEvent | null {
  const record = asRecord(data);
  if (
    !record ||
    typeof record.centralId !== 'string' ||
    typeof record.characteristicUUID !== 'string'
  ) {
    return null;
  }
  return { centralId: record.centralId, characteristicUUID: record.characteristicUUID };
}

function parsePeripheralWrite(data: unknown): BlePeripheralWriteEvent | null {
  const record = asRecord(data);
  if (
    !record ||
    typeof record.centralId !== 'string' ||
    typeof record.characteristicUUID !== 'string' ||
    typeof record.value !== 'string'
  ) {
    return null;
  }
  return {
    centralId: record.centralId,
    characteristicUUID: record.characteristicUUID,
    value: record.value,
  };
}

function parseDeviceFound(data: unknown): BleDeviceFoundEvent | null {
  const record = asRecord(data);
  if (!record || typeof record.id !== 'string') {
    return null;
  }
  return { id: record.id };
}

function parseCharacteristicValue(data: unknown): BleCharacteristicValueEvent | null {
  const record = asRecord(data);
  if (
    !record ||
    typeof record.deviceId !== 'string' ||
    typeof record.characteristicUUID !== 'string' ||
    typeof record.value !== 'string'
  ) {
    return null;
  }
  return {
    deviceId: record.deviceId,
    characteristicUUID: record.characteristicUUID,
    value: record.value,
  };
}

let munimApiOverride: MunimBleApi | null = null;

/** Test seam — inject a mock munim API. */
export function setMunimBleApiForTests(api: MunimBleApi | null): void {
  munimApiOverride = api;
}

function canUseBle(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function loadMunimBleApi(): MunimBleApi | null {
  if (munimApiOverride) {
    return munimApiOverride;
  }
  try {
    return require('munim-bluetooth') as MunimBleApi;
  } catch {
    return null;
  }
}

function encodeProtocolChunks(message: NearbyProtocolMessage): string[] {
  return chunkUtf8Payload(JSON.stringify(message)).map(encodeBleGattChunkHex);
}

function createNotifyQueue(): {
  enqueue: (task: () => Promise<void>) => Promise<void>;
  reset: () => void;
} {
  let tail: Promise<void> = Promise.resolve();
  return {
    enqueue(task) {
      const run = tail.then(task, task);
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    reset() {
      tail = Promise.resolve();
    },
  };
}

async function notifyProtocolMessage(
  api: MunimBleApi,
  message: NearbyProtocolMessage,
  queue?: ReturnType<typeof createNotifyQueue>,
): Promise<void> {
  const send = async () => {
    for (const hex of encodeProtocolChunks(message)) {
      await api.updateCharacteristicValue(
        NEARBY_BLE_SERVICE_UUID,
        NEARBY_BLE_TX_CHAR_UUID,
        hex,
        true,
      );
    }
  };
  if (queue) {
    await queue.enqueue(send);
    return;
  }
  await send();
}

async function writeProtocolMessage(
  api: MunimBleApi,
  deviceId: string,
  message: NearbyProtocolMessage,
): Promise<void> {
  for (const hex of encodeProtocolChunks(message)) {
    await api.writeCharacteristic(
      deviceId,
      NEARBY_BLE_SERVICE_UUID,
      NEARBY_BLE_RX_CHAR_UUID,
      hex,
      'write',
    );
  }
}

/**
 * BLE GATT nearby transport: peripheral host + central client (munim-bluetooth).
 * Fail-soft when the native module is missing or Bluetooth is off.
 */
export function createBleNearbyTransport(): NearbyArchiveTransport {
  let hostHandlers: NearbyHostHandlers | null = null;
  let advertising = false;
  /** Bumped on stopHost / new full setup so stale startHost cannot tear down Gen2. */
  let hostSetupEpoch = 0;
  const unsubscribers: Array<() => void> = [];
  const txQueue = createNotifyQueue();
  /** v1: one Want→archives→archivesEnd session at a time (shared TX notify). */
  let activeServeCentralId: string | null = null;
  /** Centrals that subscribed while TX was busy — Hello after serve releases. */
  const pendingHelloCentralIds = new Set<string>();
  const subscribedCentralIds = new Set<string>();
  /** Want received while another central is served — retry after release. */
  const pendingWantByCentral = new Map<
    string,
    { uid: string; wantRounds: number[]; centralId: string }
  >();
  /** Per-central RX assemblers + Want/served state. */
  const centralState = new Map<
    string,
    {
      assembler: ReturnType<typeof createBleChunkAssembler>;
      wantAcceptedUid: string | null;
      servedRounds: number[];
    }
  >();

  const clearListeners = () => {
    while (unsubscribers.length > 0) {
      const stop = unsubscribers.pop();
      try {
        stop?.();
      } catch {
        // ignore
      }
    }
    centralState.clear();
    activeServeCentralId = null;
    pendingHelloCentralIds.clear();
    subscribedCentralIds.clear();
    pendingWantByCentral.clear();
    txQueue.reset();
  };

  const ensureCentral = (centralId: string) => {
    let state = centralState.get(centralId);
    if (!state) {
      state = {
        assembler: createBleChunkAssembler(),
        wantAcceptedUid: null,
        servedRounds: [],
      };
      centralState.set(centralId, state);
    }
    return state;
  };

  const sendHelloToCentral = async (api: MunimBleApi): Promise<void> => {
    const live = hostHandlers;
    if (!live || !advertising) {
      return;
    }
    const have = await Promise.resolve(live.getHaveRounds());
    await notifyProtocolMessage(api, createHelloMessage(live.gameId, live.uid, have), txQueue);
  };

  const flushPendingHellos = async (api: MunimBleApi): Promise<void> => {
    if (activeServeCentralId != null) {
      return;
    }
    const pending = [...pendingHelloCentralIds];
    pendingHelloCentralIds.clear();
    for (const centralId of pending) {
      if (!subscribedCentralIds.has(centralId) || !advertising) {
        continue;
      }
      try {
        await sendHelloToCentral(api);
      } catch (error) {
        devLogAction('nearby ble deferred hello failed', {
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  const serveWantForCentral = async (
    api: MunimBleApi,
    centralId: string,
    uid: string,
    wantRounds: number[],
  ): Promise<void> => {
    const live = hostHandlers;
    if (!live || !advertising) {
      return;
    }
    const state = ensureCentral(centralId);
    activeServeCentralId = centralId;
    state.wantAcceptedUid = uid;
    try {
      const archives = await live.getArchivesForRounds(wantRounds);
      const served: number[] = [];
      for (const archive of archives) {
        const stripped = stripArchiveForTransfer(archive);
        if (!isPeerArchiveWithinWireLimit(stripped)) {
          continue;
        }
        await notifyProtocolMessage(
          api,
          {
            type: 'archives',
            gameId: normalizeRoomCode(live.gameId),
            archives: [stripped],
          },
          txQueue,
        );
        served.push(stripped.baseWordRound);
      }
      state.servedRounds = normalizeHaveRounds(served);
      await notifyProtocolMessage(api, createArchivesEndMessage(live.gameId), txQueue);
    } catch (error) {
      devLogAction('nearby ble want handler failed', {
        details: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (activeServeCentralId === centralId) {
        activeServeCentralId = null;
      }
      await flushPendingHellos(api);
      await flushPendingWant(api);
    }
  };

  const flushPendingWant = async (api: MunimBleApi): Promise<void> => {
    if (activeServeCentralId != null || !advertising) {
      return;
    }
    const next = pendingWantByCentral.values().next().value;
    if (!next) {
      return;
    }
    pendingWantByCentral.delete(next.centralId);
    await serveWantForCentral(api, next.centralId, next.uid, next.wantRounds);
  };

  return {
    kind: 'ble',
    isAvailable() {
      if (munimApiOverride) {
        return true;
      }
      return canUseBle() && loadMunimBleApi() != null;
    },
    async startHost(handlers) {
      if (!munimApiOverride && !canUseBle()) {
        return;
      }
      if (!isNearbyHostApplyTokenActive(handlers)) {
        return;
      }
      const api = loadMunimBleApi();
      if (!api) {
        return;
      }
      // Soft reconcile: refresh handlers without tearing down mid-serve advertising.
      if (advertising && unsubscribers.length > 0) {
        if (!isNearbyHostApplyTokenActive(handlers)) {
          return;
        }
        hostHandlers = handlers;
        void setNearbyBleCapabilityAllowed(true);
        return;
      }
      const setupEpoch = ++hostSetupEpoch;
      advertising = true;
      clearListeners();
      const abandonOwnSetup = () => {
        if (setupEpoch !== hostSetupEpoch) {
          return;
        }
        advertising = false;
        hostHandlers = null;
        clearListeners();
      };
      try {
        api.setServices([
          {
            uuid: NEARBY_BLE_SERVICE_UUID,
            characteristics: [
              {
                uuid: NEARBY_BLE_RX_CHAR_UUID,
                properties: ['write', 'writeWithoutResponse'],
              },
              {
                uuid: NEARBY_BLE_TX_CHAR_UUID,
                properties: ['notify', 'read'],
              },
            ],
          },
        ]);
        if (!isNearbyHostApplyTokenActive(handlers)) {
          abandonOwnSetup();
          return;
        }
        unsubscribers.push(
          api.addEventListener('peripheralSubscribed', (raw) => {
            const data = parsePeripheralSubscribe(raw);
            if (
              !data ||
              !advertising ||
              !hostHandlers ||
              data.characteristicUUID.toLowerCase() !== NEARBY_BLE_TX_CHAR_UUID.toLowerCase()
            ) {
              return;
            }
            subscribedCentralIds.add(data.centralId);
            void (async () => {
              try {
                const live = hostHandlers;
                if (!live) {
                  return;
                }
                // Defer Hello while another central's serve owns the TX stream.
                if (activeServeCentralId != null && activeServeCentralId !== data.centralId) {
                  pendingHelloCentralIds.add(data.centralId);
                  return;
                }
                await sendHelloToCentral(api);
              } catch (error) {
                devLogAction('nearby ble hello failed', {
                  details: error instanceof Error ? error.message : String(error),
                });
              }
            })();
          }),
        );
        unsubscribers.push(
          api.addEventListener('peripheralWriteRequest', (raw) => {
            const data = parsePeripheralWrite(raw);
            if (
              !data ||
              !advertising ||
              !hostHandlers ||
              data.characteristicUUID.toLowerCase() !== NEARBY_BLE_RX_CHAR_UUID.toLowerCase()
            ) {
              return;
            }
            const state = ensureCentral(data.centralId);
            const assembled = state.assembler.pushHex(data.value);
            if (assembled.status !== 'complete') {
              return;
            }
            let parsed: NearbyProtocolMessage | null = null;
            try {
              parsed = parseNearbyProtocolMessage(JSON.parse(assembled.payload) as unknown);
            } catch {
              return;
            }
            if (!parsed) {
              return;
            }
            const live = hostHandlers;
            if (parsed.type === 'want') {
              if (
                !isAuthorizedNearbyRequester({
                  messageGameId: parsed.gameId,
                  messageUid: parsed.uid,
                  sessionGameId: live.gameId,
                  rosterUids: live.getRosterUids(),
                })
              ) {
                return;
              }
              const wantRounds = sanitizeWantRounds(parsed.wantRounds);
              if (!wantRounds) {
                return;
              }
              // Single-flight: queue overlapping Want until the active serve releases.
              if (activeServeCentralId != null && activeServeCentralId !== data.centralId) {
                pendingWantByCentral.set(data.centralId, {
                  uid: parsed.uid,
                  wantRounds: [...wantRounds],
                  centralId: data.centralId,
                });
                return;
              }
              void serveWantForCentral(api, data.centralId, parsed.uid, wantRounds);
              return;
            }
            if (parsed.type === 'haveAck') {
              if (
                !isAuthorizedNearbyRequester({
                  messageGameId: parsed.gameId,
                  messageUid: parsed.uid,
                  sessionGameId: live.gameId,
                  rosterUids: live.getRosterUids(),
                })
              ) {
                return;
              }
              if (!shouldTrustTcpHaveAck(state.wantAcceptedUid, parsed.uid)) {
                return;
              }
              const trusted = hostTrustedHaveAckRounds(parsed.haveRounds, state.servedRounds);
              if (trusted.length === 0) {
                return;
              }
              live.onHaveAck?.(parsed.uid, trusted, 'ble');
            }
          }),
        );
        if (!isNearbyHostApplyTokenActive(handlers)) {
          abandonOwnSetup();
          return;
        }
        api.startAdvertising({
          serviceUUIDs: [NEARBY_BLE_SERVICE_UUID],
          localName: `wr-${normalizeRoomCode(handlers.gameId).slice(0, 4)}`,
        });
        if (!isNearbyHostApplyTokenActive(handlers)) {
          if (setupEpoch === hostSetupEpoch) {
            abandonOwnSetup();
            try {
              api.stopAdvertising();
            } catch {
              // ignore
            }
          }
          return;
        }
        hostHandlers = handlers;
        void setNearbyBleCapabilityAllowed(true);
      } catch (error) {
        if (setupEpoch === hostSetupEpoch) {
          advertising = false;
          hostHandlers = null;
          clearListeners();
        }
        devLogAction('nearby ble startHost failed', {
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
    async stopHost() {
      hostSetupEpoch += 1;
      advertising = false;
      hostHandlers = null;
      clearListeners();
      const api = loadMunimBleApi();
      try {
        api?.stopAdvertising();
      } catch {
        // ignore
      }
    },
    async fetchMissing(input: NearbyFetchMissingInput): Promise<NearbyFetchMissingResult> {
      const empty: NearbyFetchMissingResult = {
        archives: [],
        peerHaveRounds: new Map(),
        trustedWireCompleted: false,
      };
      if (!this.isAvailable() || input.wantRounds.length === 0 || input.timeoutMs <= 0) {
        return empty;
      }
      const api = loadMunimBleApi();
      if (!api) {
        return empty;
      }
      const want = sanitizeWantRounds(input.wantRounds);
      if (!want) {
        return empty;
      }

      const peerHaveRounds = new Map<string, number[]>();
      const archives: FinishedRoundArchive[] = [];
      const seenRounds = new Set<number>();
      let trustedWireCompleted = false;
      const deadline = Date.now() + input.timeoutMs;
      const discovered = new Map<string, string>(); // deviceId → deviceId
      let scanStartedOk = false;

      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          try {
            api.stopScan();
          } catch {
            // ignore
          }
          resolve();
        };

        const onDevice = (raw: unknown) => {
          const device = parseDeviceFound(raw);
          if (settled || !device?.id) {
            return;
          }
          discovered.set(device.id, device.id);
        };

        const removeFound = api.addEventListener('deviceFound', onDevice);
        const removeScan = api.addEventListener('onDeviceFound', onDevice);

        try {
          api.startScan({ serviceUUIDs: [NEARBY_BLE_SERVICE_UUID], allowDuplicates: false });
          scanStartedOk = true;
        } catch (error) {
          removeFound();
          removeScan();
          devLogAction('nearby ble scan failed', {
            details: error instanceof Error ? error.message : String(error),
          });
          finish();
          return;
        }

        const scanMs = Math.min(4_000, Math.max(800, Math.floor(input.timeoutMs / 4)));
        setTimeout(() => {
          void (async () => {
            try {
              api.stopScan();
            } catch {
              // ignore
            }
            removeFound();
            removeScan();

            const deviceIds = [...discovered.keys()];
            for (const deviceId of deviceIds) {
              if (Date.now() >= deadline || settled) {
                break;
              }
              try {
                await api.connect(deviceId);
                await api.discoverServices(deviceId);
                const assemblerHolder = { current: createBleChunkAssembler() };
                const received: FinishedRoundArchive[] = [];
                let ended = false;
                let sessionPhase: 'await_hello' | 'want_sent' = 'await_hello';

                await new Promise<void>((connResolve) => {
                  const timer = setTimeout(
                    () => {
                      ended = true;
                      connResolve();
                    },
                    Math.max(500, deadline - Date.now()),
                  );

                  const removeValue = api.addEventListener('characteristicValueChanged', (raw) => {
                    const data = parseCharacteristicValue(raw);
                    if (
                      !data ||
                      data.deviceId !== deviceId ||
                      data.characteristicUUID.toLowerCase() !==
                        NEARBY_BLE_TX_CHAR_UUID.toLowerCase()
                    ) {
                      return;
                    }
                    const assembled = assemblerHolder.current.pushHex(data.value);
                    if (assembled.status === 'overflow' || assembled.status === 'invalid') {
                      assemblerHolder.current = createBleChunkAssembler();
                      return;
                    }
                    if (assembled.status !== 'complete') {
                      return;
                    }
                    let message: NearbyProtocolMessage | null = null;
                    try {
                      message = parseNearbyProtocolMessage(
                        JSON.parse(assembled.payload) as unknown,
                      );
                    } catch {
                      return;
                    }
                    if (!message) {
                      return;
                    }
                    if (message.type === 'hello') {
                      if (sessionPhase !== 'await_hello') {
                        return;
                      }
                      if (normalizeRoomCode(message.gameId) !== normalizeRoomCode(input.gameId)) {
                        return;
                      }
                      peerHaveRounds.set(message.uid, message.haveRounds);
                      input.onPeerHello?.(message.uid, message.haveRounds);
                      sessionPhase = 'want_sent';
                      assemblerHolder.current = createBleChunkAssembler();
                      void writeProtocolMessage(
                        api,
                        deviceId,
                        createWantMessage(input.gameId, input.selfUid, want),
                      );
                      return;
                    }
                    // Ignore foreign TX (shared notify) until after our Want.
                    if (sessionPhase !== 'want_sent') {
                      return;
                    }
                    if (message.type === 'archives') {
                      for (const rawArchive of message.archives) {
                        if (!isValidPeerArchiveShape(rawArchive)) {
                          continue;
                        }
                        const stripped = stripArchiveForTransfer(rawArchive);
                        received.push(stripped);
                        if (!seenRounds.has(stripped.baseWordRound)) {
                          archives.push(stripped);
                          seenRounds.add(stripped.baseWordRound);
                        }
                      }
                      return;
                    }
                    if (message.type === 'archivesEnd') {
                      const ackRounds = clientHaveAckRoundsFromReceived(received);
                      void writeProtocolMessage(
                        api,
                        deviceId,
                        createHaveAckMessage(input.gameId, input.selfUid, ackRounds),
                      ).finally(() => {
                        if (ackRounds.length > 0) {
                          trustedWireCompleted = true;
                        }
                        clearTimeout(timer);
                        ended = true;
                        connResolve();
                      });
                    }
                  });

                  try {
                    api.subscribeToCharacteristic(
                      deviceId,
                      NEARBY_BLE_SERVICE_UUID,
                      NEARBY_BLE_TX_CHAR_UUID,
                    );
                  } catch {
                    clearTimeout(timer);
                    removeValue();
                    connResolve();
                  }

                  const waitEnd = setInterval(() => {
                    if (ended || Date.now() >= deadline) {
                      clearInterval(waitEnd);
                      clearTimeout(timer);
                      removeValue();
                      connResolve();
                    }
                  }, 200);
                });

                try {
                  api.disconnect(deviceId);
                } catch {
                  // ignore
                }
              } catch (error) {
                devLogAction('nearby ble peer fetch failed', {
                  details: error instanceof Error ? error.message : String(error),
                });
                try {
                  api.disconnect(deviceId);
                } catch {
                  // ignore
                }
              }
            }
            finish();
          })();
        }, scanMs);
      });

      // Confirm BLE only after startScan succeeded (failed startScan must not unlock play).
      if (scanStartedOk) {
        void setNearbyBleCapabilityAllowed(true);
      }
      return { archives, peerHaveRounds, trustedWireCompleted };
    },
    async announceHaveAck() {
      // BLE HaveAck is connection-scoped after ArchivesEnd; no separate broadcast in v1.
    },
  };
}
