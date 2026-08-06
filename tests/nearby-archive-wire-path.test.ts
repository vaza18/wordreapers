import { describe, expect, it, vi } from 'vitest';

import { androidNearbyPermissionList } from '@/lib/online/nearby/android-nearby-permissions';
import { createFetchMissingSettler } from '@/lib/online/nearby/fetch-missing-settler';
import {
  clientHaveAckRoundsFromReceived,
  hostTrustedHaveAckRounds,
} from '@/lib/online/nearby/have-ack-rounds';
import { PeerHaveRoundsMap } from '@/lib/online/nearby/peer-have-rounds';
import { shouldAdvertiseForLobbyRoster } from '@/lib/online/nearby/should-advertise-lobby';
import { shouldTrustTcpHaveAck } from '@/lib/online/nearby/tcp-have-ack-trust';

describe('nearby wire-path review (C1/C2/C3/C4)', () => {
  describe('C1 — HaveAck only received/served rounds', () => {
    it('client ack never includes wantRounds on faith', () => {
      expect(clientHaveAckRoundsFromReceived([])).toEqual([]);
      expect(clientHaveAckRoundsFromReceived([{ baseWordRound: 0 }])).toEqual([0]);
      // Wanted [0,1] but only round 0 accepted
      expect(clientHaveAckRoundsFromReceived([{ baseWordRound: 0 }, { baseWordRound: 0 }])).toEqual(
        [0],
      );
    });

    it('partial served HaveAck does not make peer complete for N=2', () => {
      const claimed = clientHaveAckRoundsFromReceived([{ baseWordRound: 0 }]);
      const trusted = hostTrustedHaveAckRounds(claimed, [0]); // host served only 0
      // Spoof claiming [0,1] still capped to served
      expect(hostTrustedHaveAckRounds([0, 1], [0])).toEqual([0]);

      const peerHave = new PeerHaveRoundsMap();
      const gameId = 'K7X3P';
      peerHave.setHaveRounds(gameId, 'b', trusted, 'trusted');
      expect(peerHave.isComplete(gameId, 'b', 2)).toBe(false);
      expect(
        shouldAdvertiseForLobbyRoster({
          baseWordRound: 2,
          selfUid: 'a',
          onlineUids: ['a', 'b'],
          localPriorArchiveCount: 2,
          peerHave,
          gameId,
        }),
      ).toBe(true);
    });

    it('full served + matching claim can complete', () => {
      const trusted = hostTrustedHaveAckRounds([0, 1], [0, 1]);
      const peerHave = new PeerHaveRoundsMap();
      peerHave.setHaveRounds('K7X3P', 'b', trusted, 'trusted');
      expect(peerHave.isComplete('K7X3P', 'b', 2)).toBe(true);
    });
  });

  describe('C2 — fetchMissing settler barrier', () => {
    it('probe does not finish while fetch is in flight past deadline', () => {
      let now = 1000;
      const onFinish = vi.fn();
      const settler = createFetchMissingSettler({
        deadlineMs: 1500,
        now: () => now,
        onFinish,
      });
      settler.markFetchStarted();
      now = 2000;
      settler.onProbeTick();
      expect(onFinish).not.toHaveBeenCalled();
      expect(settler.isSettled()).toBe(false);
      settler.finish();
      expect(onFinish).toHaveBeenCalledTimes(1);
      settler.finish();
      expect(onFinish).toHaveBeenCalledTimes(1);
    });

    it('probe finishes when deadline passes before fetch starts', () => {
      let now = 1000;
      const onFinish = vi.fn();
      const settler = createFetchMissingSettler({
        deadlineMs: 1500,
        now: () => now,
        onFinish,
      });
      now = 1600;
      settler.onProbeTick();
      expect(onFinish).toHaveBeenCalledTimes(1);
      expect(settler.isSettled()).toBe(true);
    });

    it('shouldAbort after settle prevents post-return mutation pattern', () => {
      const archives: number[] = [];
      const settler = createFetchMissingSettler({
        deadlineMs: 999999,
        onFinish: () => undefined,
      });
      settler.markFetchStarted();
      // Simulate late TCP result after finish
      settler.finish();
      const lateRounds = [0, 1];
      if (!settler.isSettled()) {
        archives.push(...lateRounds);
      }
      // Correct pattern: check before mutate
      if (!settler.shouldAbort()) {
        archives.push(2);
      }
      expect(archives).toEqual([]);
    });
  });

  describe('C3 — Android permission API gates', () => {
    it('API 31/32 omit NEARBY_WIFI_DEVICES but include BLE', () => {
      for (const api of [31, 32]) {
        const list = androidNearbyPermissionList(api);
        expect(list).not.toContain('android.permission.NEARBY_WIFI_DEVICES');
        expect(list).toContain('android.permission.BLUETOOTH_SCAN');
        expect(list).toContain('android.permission.BLUETOOTH_ADVERTISE');
      }
    });

    it('API 33+ includes NEARBY_WIFI_DEVICES and BLE', () => {
      const list = androidNearbyPermissionList(33);
      expect(list).toContain('android.permission.NEARBY_WIFI_DEVICES');
      expect(list).toContain('android.permission.BLUETOOTH_CONNECT');
    });

    it('API < 31 uses location for BLE legacy path', () => {
      const list = androidNearbyPermissionList(30);
      expect(list.some((p) => p.includes('FINE_LOCATION') || p.includes('ACCESS_FINE'))).toBe(true);
    });
  });

  describe('C4 — Want gate + served intersection', () => {
    it('HaveAck without Want is not trusted', () => {
      expect(shouldTrustTcpHaveAck(null, 'victim')).toBe(false);
    });

    it('claimed rounds beyond served do not stop advertise', () => {
      // Attacker Want(victim) got only what host had; claiming full history is capped
      const trusted = hostTrustedHaveAckRounds([0, 1, 2], [0]);
      expect(trusted).toEqual([0]);
      const peerHave = new PeerHaveRoundsMap();
      peerHave.setHaveRounds('K7X3P', 'victim', trusted, 'trusted');
      expect(
        shouldAdvertiseForLobbyRoster({
          baseWordRound: 3,
          selfUid: 'host',
          onlineUids: ['host', 'victim'],
          localPriorArchiveCount: 3,
          peerHave,
          gameId: 'K7X3P',
        }),
      ).toBe(true);
    });
  });
});
