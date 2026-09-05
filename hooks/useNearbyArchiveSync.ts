import { useEffect, useRef } from 'react';

import type { GameSession } from '@/lib/firebase/types';
import {
  clearNearbyPeerStateForGame,
  maybeSyncNearbyArchives,
  reconcileNearbyArchiveHost,
  stopNearbyArchiveHost,
} from '@/lib/online/nearby/nearby-archive-sync';
import { onlinePlayerUids } from '@/lib/online/nearby/should-advertise-lobby';

function onlineRosterFingerprint(session: GameSession | null | undefined): string {
  if (!session?.players) {
    return '';
  }
  return onlinePlayerUids(session.players).join(',');
}

/**
 * Lobby/play effect body: stop host → sync → host (or stay stopped).
 * `generation` + `getCurrentGeneration` prevent a superseded cycle from hosting or
 * tearing down a newer cycle's host.
 * Exported for unit tests (C1 QR close / flap).
 */
export async function runNearbySyncThenHostCycle(input: {
  generation: number;
  getCurrentGeneration: () => number;
  sync: () => Promise<void>;
  /** Called only while this generation is still current; must re-check before mutating host. */
  afterSync: (isCurrent: () => boolean) => Promise<void>;
  stopHost: () => Promise<void>;
}): Promise<void> {
  const isCurrent = () => input.getCurrentGeneration() === input.generation;

  await input.stopHost();
  if (!isCurrent()) {
    return;
  }
  await input.sync();
  if (!isCurrent()) {
    return;
  }
  await input.afterSync(isCurrent);
}

/**
 * Lobby: advertise when peers may need archives; sync own gaps; cleanup on leave.
 */
export function useNearbyArchiveLobbySync(input: {
  gameId: string;
  selfUid: string;
  session: GameSession | null;
  enabled?: boolean;
}): void {
  const { gameId, selfUid, session, enabled = true } = input;
  const baseWordRound = session?.baseWordRound ?? 0;
  const invitedBy = session?.players[selfUid]?.invitedBy ?? '';
  const onlineFingerprint = onlineRosterFingerprint(session);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const generationRef = useRef(0);

  useEffect(() => {
    if (!enabled || !selfUid || !gameId) {
      if (!enabled) {
        void stopNearbyArchiveHost();
      }
      return;
    }
    const live = sessionRef.current;
    if (!live) {
      return;
    }
    const generation = ++generationRef.current;
    void runNearbySyncThenHostCycle({
      generation,
      getCurrentGeneration: () => generationRef.current,
      stopHost: () => stopNearbyArchiveHost(),
      sync: () =>
        maybeSyncNearbyArchives({
          gameId,
          selfUid,
          baseWordRound,
          session: live,
          invitedByUid: live.players[selfUid]?.invitedBy,
          allowBleProbe: true,
        }),
      afterSync: async (isCurrent) => {
        if (!isCurrent()) {
          return;
        }
        await reconcileNearbyArchiveHost({
          gameId,
          selfUid,
          baseWordRound,
          session: live,
          mode: 'lobby',
          isCurrent,
        });
      },
    });
    return () => {
      // Bump generation so in-flight cycle becomes stale; stop advertise immediately.
      generationRef.current += 1;
      void stopNearbyArchiveHost();
    };
  }, [enabled, gameId, selfUid, baseWordRound, invitedBy, onlineFingerprint]);

  useEffect(() => {
    return () => {
      void stopNearbyArchiveHost();
      clearNearbyPeerStateForGame(gameId);
    };
  }, [gameId]);
}

/**
 * Play restart key — intentionally omits online roster fingerprint so presence
 * flaps mid-round do not re-run the full LAN+BLE sync budget.
 */
export function nearbyPlaySyncRestartKey(input: {
  enabled: boolean;
  gameId: string;
  selfUid: string;
  baseWordRound: number;
  invitedBy: string;
  inviteModalVisible: boolean;
}): string {
  return [
    input.enabled ? '1' : '0',
    input.gameId,
    input.selfUid,
    String(input.baseWordRound),
    input.invitedBy,
    input.inviteModalVisible ? '1' : '0',
  ].join('|');
}

/**
 * Play: sync gaps on round bump; QR modal drives forced host advertise.
 * Sync and host share one effect so QR advertise never races an in-flight fetch.
 */
export function useNearbyArchivePlaySync(input: {
  gameId: string;
  selfUid: string;
  session: GameSession | null;
  inviteModalVisible: boolean;
  enabled?: boolean;
}): void {
  const { gameId, selfUid, session, inviteModalVisible, enabled = true } = input;
  const baseWordRound = session?.baseWordRound ?? 0;
  const invitedBy = session?.players[selfUid]?.invitedBy ?? '';
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const generationRef = useRef(0);
  const playRestartKey = nearbyPlaySyncRestartKey({
    enabled,
    gameId,
    selfUid,
    baseWordRound,
    invitedBy,
    inviteModalVisible,
  });

  useEffect(() => {
    if (!enabled || !selfUid || !gameId) {
      if (!enabled) {
        void stopNearbyArchiveHost();
      }
      return;
    }
    const live = sessionRef.current;
    if (!live) {
      return;
    }
    const generation = ++generationRef.current;
    const wantQrHost = inviteModalVisible && baseWordRound > 0;
    void runNearbySyncThenHostCycle({
      generation,
      getCurrentGeneration: () => generationRef.current,
      stopHost: () => stopNearbyArchiveHost(),
      sync: () =>
        maybeSyncNearbyArchives({
          gameId,
          selfUid,
          baseWordRound,
          session: live,
          invitedByUid: live.players[selfUid]?.invitedBy,
          allowOsPermissionPrompt: false,
          allowBleProbe: false,
        }),
      afterSync: async (isCurrent) => {
        if (!isCurrent()) {
          return;
        }
        if (wantQrHost) {
          await reconcileNearbyArchiveHost({
            gameId,
            selfUid,
            baseWordRound,
            session: live,
            mode: 'playQr',
            forceAdvertise: true,
            isCurrent,
          });
          return;
        }
        if (!isCurrent()) {
          return;
        }
        await stopNearbyArchiveHost();
      },
    });
    return () => {
      generationRef.current += 1;
      // QR close / deps change: stop advertise immediately (not after sync budget).
      void stopNearbyArchiveHost();
    };
    // Restart inputs are encoded in playRestartKey (see nearbyPlaySyncRestartKey).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: key is SoT
  }, [playRestartKey]);

  useEffect(() => {
    return () => {
      void stopNearbyArchiveHost();
      clearNearbyPeerStateForGame(gameId);
    };
  }, [gameId]);
}
