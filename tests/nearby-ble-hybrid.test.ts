import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createBleNearbyTransport,
  setMunimBleApiForTests,
  type MunimBleApi,
} from '@/lib/online/nearby/ble-transport';
import {
  NEARBY_BLE_RX_CHAR_UUID,
  NEARBY_BLE_SERVICE_UUID,
  NEARBY_BLE_TX_CHAR_UUID,
} from '@/lib/online/nearby/ble-uuids';
import { createHybridNearbyTransport } from '@/lib/online/nearby/hybrid-transport';
import { androidNearbyPermissionList } from '@/lib/online/nearby/android-nearby-permissions';
import {
  resetNearbyArchiveSyncPermissionCacheForTests,
  setNearbyBleCapabilityAllowed,
} from '@/lib/online/nearby/permission';
import type { FinishedRoundArchive } from '@/lib/online/session/online-session-archive';
import { chunkUtf8Payload, encodeBleGattChunkHex } from '@/lib/online/nearby/ble-gatt-framing';
import {
  createHaveAckMessage,
  createWantMessage,
  parseNearbyProtocolMessage,
} from '@/lib/online/nearby/protocol';
import { createBleChunkAssembler } from '@/lib/online/nearby/ble-gatt-framing';

function makeArchive(round: number): FinishedRoundArchive {
  return {
    gameId: 'K7X3P',
    baseWordRound: round,
    savedAt: 1000 + round,
    session: {
      baseWord: `w${round}`,
      status: 'finished',
      settings: {
        durationSeconds: 60,
        uniqueBonusEnabled: false,
        language: 'uk-uk',
        allowProperNouns: false,
        allowSlang: false,
      },
      timerEndsAt: null,
      organizerId: 'host',
      players: {
        host: { name: 'H', wordCount: 1, score: 1, online: true },
        joiner: { name: 'J', wordCount: 0, score: 0, online: true },
      },
      liveRoundPlayerUids: ['host', 'joiner'],
      baseWordRound: round,
    },
    playerWords: { host: ['а'], joiner: [] },
    playerWordCounts: { host: 1, joiner: 0 },
  };
}

function createMockMunim(): MunimBleApi & {
  emit: (event: string, data: unknown) => void;
  txNotifies: string[];
} {
  const listeners = new Map<string, Set<(data: never) => void>>();
  const txNotifies: string[] = [];
  return {
    txNotifies,
    emit(event, data) {
      for (const cb of listeners.get(event) ?? []) {
        cb(data as never);
      }
    },
    setServices: vi.fn(),
    startAdvertising: vi.fn(),
    stopAdvertising: vi.fn(),
    updateCharacteristicValue: vi.fn(async (_s, char, value, notify) => {
      if (notify && char.toLowerCase() === NEARBY_BLE_TX_CHAR_UUID.toLowerCase()) {
        txNotifies.push(value);
        for (const cb of listeners.get('characteristicValueChanged') ?? []) {
          cb({
            deviceId: 'central-1',
            serviceUUID: NEARBY_BLE_SERVICE_UUID,
            characteristicUUID: NEARBY_BLE_TX_CHAR_UUID,
            value,
          } as never);
        }
      }
    }),
    startScan: vi.fn(),
    stopScan: vi.fn(),
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    discoverServices: vi.fn(async () => []),
    writeCharacteristic: vi.fn(async (deviceId, _s, char, value) => {
      if (char.toLowerCase() === NEARBY_BLE_RX_CHAR_UUID.toLowerCase()) {
        for (const cb of listeners.get('peripheralWriteRequest') ?? []) {
          cb({
            centralId: deviceId === 'peer-device' ? 'central-1' : deviceId,
            serviceUUID: NEARBY_BLE_SERVICE_UUID,
            characteristicUUID: NEARBY_BLE_RX_CHAR_UUID,
            value,
          } as never);
        }
      }
    }),
    subscribeToCharacteristic: vi.fn((deviceId) => {
      for (const cb of listeners.get('peripheralSubscribed') ?? []) {
        cb({
          centralId: 'central-1',
          serviceUUID: NEARBY_BLE_SERVICE_UUID,
          characteristicUUID: NEARBY_BLE_TX_CHAR_UUID,
        } as never);
      }
      void deviceId;
    }),
    addEventListener: (event, callback) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(callback);
      return () => listeners.get(event)?.delete(callback);
    },
  };
}

describe('nearby BLE GATT transport', () => {
  beforeEach(async () => {
    setMunimBleApiForTests(null);
    resetNearbyArchiveSyncPermissionCacheForTests();
    await setNearbyBleCapabilityAllowed(true);
  });

  it('host serves archives over GATT and trusts HaveAck after Want', async () => {
    const mock = createMockMunim();
    setMunimBleApiForTests(mock);
    const acks: Array<{ uid: string; rounds: number[]; source: string }> = [];
    const host = createBleNearbyTransport();
    expect(host.isAvailable()).toBe(true);

    await host.startHost({
      gameId: 'K7X3P',
      uid: 'host',
      getHaveRounds: () => [0, 1],
      getRosterUids: () => ['host', 'joiner'],
      getArchivesForRounds: async (rounds) =>
        rounds.map((round) => makeArchive(round)).filter(Boolean),
      onHaveAck: (uid, rounds, source) => {
        acks.push({ uid, rounds: [...rounds], source });
      },
    });

    mock.emit('peripheralSubscribed', {
      centralId: 'central-1',
      characteristicUUID: NEARBY_BLE_TX_CHAR_UUID,
    });
    await vi.waitFor(() => {
      expect(mock.txNotifies.length).toBeGreaterThan(0);
    });

    const want = createWantMessage('K7X3P', 'joiner', [0, 1]);
    for (const chunk of chunkUtf8Payload(JSON.stringify(want))) {
      mock.emit('peripheralWriteRequest', {
        centralId: 'central-1',
        characteristicUUID: NEARBY_BLE_RX_CHAR_UUID,
        value: encodeBleGattChunkHex(chunk),
      });
    }
    await vi.waitFor(() => {
      expect(mock.txNotifies.length).toBeGreaterThan(2);
    });

    const ack = createHaveAckMessage('K7X3P', 'joiner', [0, 1]);
    for (const chunk of chunkUtf8Payload(JSON.stringify(ack))) {
      mock.emit('peripheralWriteRequest', {
        centralId: 'central-1',
        characteristicUUID: NEARBY_BLE_RX_CHAR_UUID,
        value: encodeBleGattChunkHex(chunk),
      });
    }
    await vi.waitFor(() => {
      expect(acks.some((entry) => entry.source === 'ble' && entry.uid === 'joiner')).toBe(true);
    });

    await host.stopHost();
  });

  it('hybrid is available when BLE mock is injected', () => {
    const mock = createMockMunim();
    setMunimBleApiForTests(mock);
    const hybrid = createHybridNearbyTransport();
    // react-native-web in vitest → LAN false; BLE override makes hybrid available.
    expect(createBleNearbyTransport().isAvailable()).toBe(true);
    expect(hybrid.isAvailable()).toBe(true);
  });

  it('Android permission union includes BLE on API 31+', () => {
    const list = androidNearbyPermissionList(33);
    expect(list).toContain('android.permission.NEARBY_WIFI_DEVICES');
    expect(list).toContain('android.permission.BLUETOOTH_SCAN');
    expect(list).toContain('android.permission.BLUETOOTH_ADVERTISE');
  });

  it('hybrid skips BLE startHost when ble capability denied (LAN-only)', async () => {
    const mock = createMockMunim();
    setMunimBleApiForTests(mock);
    await setNearbyBleCapabilityAllowed(false);
    const hybrid = createHybridNearbyTransport();
    await hybrid.startHost({
      gameId: 'K7X3P',
      uid: 'host',
      getHaveRounds: () => [0],
      getRosterUids: () => ['host'],
      getArchivesForRounds: async () => [],
    });
    expect(mock.startAdvertising).not.toHaveBeenCalled();
  });

  it('hybrid skips BLE startHost after deny even with allowBleProbe (I1)', async () => {
    const mock = createMockMunim();
    setMunimBleApiForTests(mock);
    await setNearbyBleCapabilityAllowed(false);
    const hybrid = createHybridNearbyTransport();
    await hybrid.startHost({
      gameId: 'K7X3P',
      uid: 'host',
      allowBleProbe: true,
      getHaveRounds: () => [0],
      getRosterUids: () => ['host'],
      getArchivesForRounds: async () => [],
    });
    expect(mock.startAdvertising).not.toHaveBeenCalled();
  });

  it('serializes TX and single-flights concurrent Want serves (B2)', async () => {
    const mock = createMockMunim();
    // Slow TX so overlapping Want would interleave without a mutex.
    mock.updateCharacteristicValue = vi.fn(async (_s, char, value, notify) => {
      await new Promise((r) => setTimeout(r, 5));
      if (notify && char.toLowerCase() === NEARBY_BLE_TX_CHAR_UUID.toLowerCase()) {
        mock.txNotifies.push(value);
      }
    });
    setMunimBleApiForTests(mock);
    const acks: Array<{ uid: string; rounds: number[] }> = [];
    const host = createBleNearbyTransport();
    let serveCalls = 0;
    await host.startHost({
      gameId: 'K7X3P',
      uid: 'host',
      getHaveRounds: () => [0, 1],
      getRosterUids: () => ['host', 'joiner', 'joiner2'],
      getArchivesForRounds: async (rounds) => {
        serveCalls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return rounds.map((round) => makeArchive(round));
      },
      onHaveAck: (uid, rounds) => {
        acks.push({ uid, rounds: [...rounds] });
      },
    });

    const emitWant = (centralId: string, uid: string) => {
      const want = createWantMessage('K7X3P', uid, [0, 1]);
      for (const chunk of chunkUtf8Payload(JSON.stringify(want))) {
        mock.emit('peripheralWriteRequest', {
          centralId,
          characteristicUUID: NEARBY_BLE_RX_CHAR_UUID,
          value: encodeBleGattChunkHex(chunk),
        });
      }
    };

    emitWant('central-1', 'joiner');
    emitWant('central-2', 'joiner2');

    await vi.waitFor(() => {
      expect(serveCalls).toBe(1);
    });
    // Wait for first serve TX to finish (archives + end).
    await vi.waitFor(() => {
      const assembler = createBleChunkAssembler();
      let sawEnd = false;
      for (const hex of mock.txNotifies) {
        const assembled = assembler.pushHex(hex);
        if (assembled.status === 'complete') {
          const msg = parseNearbyProtocolMessage(JSON.parse(assembled.payload) as unknown);
          if (msg?.type === 'archivesEnd') {
            sawEnd = true;
          }
        }
      }
      expect(sawEnd).toBe(true);
    });

    // Chunk stream must reassemble without overflow/abort (no interleaved messages).
    const assembler = createBleChunkAssembler();
    for (const hex of mock.txNotifies) {
      const assembled = assembler.pushHex(hex);
      expect(assembled.status).not.toBe('overflow');
      expect(assembled.status).not.toBe('invalid');
    }

    const ack = createHaveAckMessage('K7X3P', 'joiner', [0, 1]);
    for (const chunk of chunkUtf8Payload(JSON.stringify(ack))) {
      mock.emit('peripheralWriteRequest', {
        centralId: 'central-1',
        characteristicUUID: NEARBY_BLE_RX_CHAR_UUID,
        value: encodeBleGattChunkHex(chunk),
      });
    }
    await vi.waitFor(() => {
      expect(acks.some((a) => a.uid === 'joiner')).toBe(true);
    });

    // Overlapping Want was queued — second serve runs after first release (I1).
    await vi.waitFor(() => {
      expect(serveCalls).toBe(2);
    });

    await host.stopHost();
  });

  it('defers Hello for central-2 during serve and sends after archivesEnd (C2)', async () => {
    const mock = createMockMunim();
    mock.updateCharacteristicValue = vi.fn(async (_s, char, value, notify) => {
      await new Promise((r) => setTimeout(r, 2));
      if (notify && char.toLowerCase() === NEARBY_BLE_TX_CHAR_UUID.toLowerCase()) {
        mock.txNotifies.push(value);
      }
    });
    setMunimBleApiForTests(mock);
    const host = createBleNearbyTransport();
    await host.startHost({
      gameId: 'K7X3P',
      uid: 'host',
      getHaveRounds: () => [0, 1],
      getRosterUids: () => ['host', 'joiner', 'joiner2'],
      getArchivesForRounds: async (rounds) => {
        await new Promise((r) => setTimeout(r, 30));
        return rounds.map((round) => makeArchive(round));
      },
    });

    // Start serve for central-1.
    const want = createWantMessage('K7X3P', 'joiner', [0, 1]);
    for (const chunk of chunkUtf8Payload(JSON.stringify(want))) {
      mock.emit('peripheralWriteRequest', {
        centralId: 'central-1',
        characteristicUUID: NEARBY_BLE_RX_CHAR_UUID,
        value: encodeBleGattChunkHex(chunk),
      });
    }

    // Subscribe central-2 while serve owns TX — must not drop Hello forever.
    mock.emit('peripheralSubscribed', {
      centralId: 'central-2',
      characteristicUUID: NEARBY_BLE_TX_CHAR_UUID,
    });

    await vi.waitFor(() => {
      const assembler = createBleChunkAssembler();
      let helloAfterEnd = false;
      let sawEnd = false;
      for (const hex of mock.txNotifies) {
        const assembled = assembler.pushHex(hex);
        if (assembled.status !== 'complete') {
          continue;
        }
        const msg = parseNearbyProtocolMessage(JSON.parse(assembled.payload) as unknown);
        if (msg?.type === 'archivesEnd') {
          sawEnd = true;
        }
        if (sawEnd && msg?.type === 'hello') {
          helloAfterEnd = true;
        }
      }
      expect(helloAfterEnd).toBe(true);
    });

    await host.stopHost();
  });

  it('failed startScan does not confirm bleAllowed (C1)', async () => {
    const {
      isNearbyBleCapabilityAllowedSync,
      setNearbyBleCapabilityAllowed,
      resetNearbyArchiveSyncPermissionCacheForTests,
    } = await import('@/lib/online/nearby/permission');
    resetNearbyArchiveSyncPermissionCacheForTests();
    await setNearbyBleCapabilityAllowed(false);
    expect(isNearbyBleCapabilityAllowedSync()).toBe(false);

    const mock = createMockMunim();
    mock.startScan = vi.fn(() => {
      throw new Error('BT denied');
    });
    setMunimBleApiForTests(mock);
    const client = createBleNearbyTransport();
    const result = await client.fetchMissing({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      candidateUids: ['host'],
      wantRounds: [0],
      timeoutMs: 2_000,
    });
    expect(result.archives).toEqual([]);
    expect(isNearbyBleCapabilityAllowedSync()).toBe(false);
  });
});
