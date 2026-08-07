import { Platform } from 'react-native';

import { createBleNearbyTransport } from './ble-transport.js';
import { createLanNearbyTransport } from './lan-transport.js';
import {
  isNearbyBleCapabilityAllowedSync,
  isNearbyBleCapabilityDeniedSync,
  isNearbyLanCapabilityAllowedSync,
} from './permission.js';
import type {
  NearbyArchiveTransport,
  NearbyFetchMissingInput,
  NearbyFetchMissingResult,
  NearbyHostHandlers,
} from './nearby-archive-transport.js';
import { isNearbyHostApplyTokenActive } from './nearby-archive-transport.js';

function createNoopTransport(): NearbyArchiveTransport {
  return {
    kind: 'noop',
    isAvailable: () => false,
    async startHost() {},
    async stopHost() {},
    async fetchMissing(): Promise<NearbyFetchMissingResult> {
      return { archives: [], peerHaveRounds: new Map(), trustedWireCompleted: false };
    },
    async announceHaveAck() {},
  };
}

function mergeFetchResults(
  a: NearbyFetchMissingResult,
  b: NearbyFetchMissingResult,
): NearbyFetchMissingResult {
  const archives = [...a.archives];
  const seen = new Set(a.archives.map((archive) => archive.baseWordRound));
  for (const archive of b.archives) {
    if (!seen.has(archive.baseWordRound)) {
      archives.push(archive);
      seen.add(archive.baseWordRound);
    }
  }
  const peerHaveRounds = new Map(a.peerHaveRounds);
  for (const [uid, rounds] of b.peerHaveRounds) {
    peerHaveRounds.set(uid, rounds);
  }
  return {
    archives,
    peerHaveRounds,
    trustedWireCompleted: a.trustedWireCompleted || b.trustedWireCompleted,
  };
}

function blePhaseAllowed(ble: NearbyArchiveTransport, allowBleProbe?: boolean): boolean {
  if (!ble.isAvailable()) {
    return false;
  }
  if (isNearbyBleCapabilityAllowedSync()) {
    return true;
  }
  // Explicit BT deny must not be reopened by lobby/join probe.
  if (isNearbyBleCapabilityDeniedSync()) {
    return false;
  }
  // Unknown only — explicit lobby/join probe (never from play hydrate alone).
  return allowBleProbe === true;
}

function lanPhaseAllowed(lan: NearbyArchiveTransport): boolean {
  return lan.isAvailable() && isNearbyLanCapabilityAllowedSync();
}

/**
 * Hybrid transport: LAN UDP+TCP first, then BLE GATT fallback (munim-bluetooth).
 * Host advertises on both when available so off-LAN peers can still discover.
 * LAN/BLE phases are gated independently so denying one never blocks the other.
 */
export function createHybridNearbyTransport(): NearbyArchiveTransport {
  const ble = createBleNearbyTransport();
  // Vitest aliases react-native → web; allow BLE when a test munim seam is injected.
  if (Platform.OS === 'web' && !ble.isAvailable()) {
    return createNoopTransport();
  }
  const lan = createLanNearbyTransport();

  return {
    kind: lan.isAvailable() || ble.isAvailable() ? 'hybrid' : 'noop',
    isAvailable() {
      return lan.isAvailable() || ble.isAvailable();
    },
    async startHost(handlers: NearbyHostHandlers) {
      if (!isNearbyHostApplyTokenActive(handlers)) {
        return;
      }
      if (lanPhaseAllowed(lan)) {
        try {
          await lan.startHost(handlers);
        } catch {
          // LAN fail-soft — BLE may still host
        }
      }
      if (!isNearbyHostApplyTokenActive(handlers)) {
        return;
      }
      if (blePhaseAllowed(ble, handlers.allowBleProbe)) {
        try {
          await ble.startHost(handlers);
        } catch {
          // BLE fail-soft
        }
      }
    },
    async stopHost() {
      await Promise.allSettled([lan.stopHost(), ble.stopHost()]);
    },
    async fetchMissing(input: NearbyFetchMissingInput): Promise<NearbyFetchMissingResult> {
      if (!this.isAvailable()) {
        return { archives: [], peerHaveRounds: new Map(), trustedWireCompleted: false };
      }
      let merged: NearbyFetchMissingResult = {
        archives: [],
        peerHaveRounds: new Map(),
        trustedWireCompleted: false,
      };
      const lanBudget = input.lanTimeoutMs ?? input.timeoutMs;
      if (lanPhaseAllowed(lan) && lanBudget > 0) {
        try {
          merged = await lan.fetchMissing({
            ...input,
            wantRounds: input.wantRounds,
            timeoutMs: lanBudget,
          });
        } catch {
          // continue to BLE
        }
      }

      const have = new Set(merged.archives.map((archive) => archive.baseWordRound));
      const gapRounds = input.byteGapRounds ?? input.wantRounds;
      const gapsLeft = gapRounds.filter((round) => !have.has(round));
      const needBleForGaps = gapsLeft.length > 0;
      const needBleForCompletion = input.seekCompletionAck === true && !merged.trustedWireCompleted;
      const bleBudget = input.bleTimeoutMs ?? 0;
      // Capability SoT (denied never reopens) + live probe/suppress callback.
      const liveOk = input.isBlePhaseStillAllowed?.() ?? true;
      if (
        blePhaseAllowed(ble, liveOk) &&
        liveOk &&
        bleBudget > 0 &&
        (needBleForGaps || needBleForCompletion)
      ) {
        try {
          const bleResult = await ble.fetchMissing({
            ...input,
            wantRounds: input.wantRounds,
            timeoutMs: bleBudget,
          });
          merged = mergeFetchResults(merged, bleResult);
        } catch {
          // ignore
        }
      }
      return merged;
    },
    async announceHaveAck(gameId, uid, haveRounds) {
      await Promise.allSettled([
        lanPhaseAllowed(lan)
          ? (lan.announceHaveAck?.(gameId, uid, haveRounds) ?? Promise.resolve())
          : Promise.resolve(),
        blePhaseAllowed(ble)
          ? (ble.announceHaveAck?.(gameId, uid, haveRounds) ?? Promise.resolve())
          : Promise.resolve(),
      ]);
    },
  };
}
