import type { FinishedRoundArchive } from '../session/online-session-archive.js';
import { normalizeRoomCode } from '../../firebase/room-code.js';

import {
  createHaveAckMessage,
  createWantMessage,
  isAuthorizedNearbyRequester,
} from './protocol.js';
import type {
  NearbyArchiveTransport,
  NearbyFetchMissingInput,
  NearbyFetchMissingResult,
  NearbyHostHandlers,
} from './nearby-archive-transport.js';
import { isNearbyHostApplyTokenActive } from './nearby-archive-transport.js';
import { stripArchiveForTransfer, isPeerArchiveWithinWireLimit } from './strip-archive.js';
import { clientHaveAckRoundsFromReceived } from './have-ack-rounds.js';
import { sanitizeWantRounds } from './want-rounds.js';

type MemoryHost = {
  handlers: NearbyHostHandlers;
  advertising: boolean;
};

const memoryHosts = new Set<MemoryHost>();

/**
 * In-process transport for unit tests (simulates LAN peers in one JS runtime).
 */
export function createMemoryNearbyTransport(): NearbyArchiveTransport {
  let selfHost: MemoryHost | null = null;

  return {
    kind: 'memory',
    isAvailable() {
      return true;
    },
    async startHost(handlers) {
      if (!isNearbyHostApplyTokenActive(handlers)) {
        return;
      }
      if (selfHost) {
        memoryHosts.delete(selfHost);
      }
      selfHost = { handlers, advertising: true };
      memoryHosts.add(selfHost);
    },
    async stopHost() {
      if (selfHost) {
        memoryHosts.delete(selfHost);
        selfHost = null;
      }
    },
    async fetchMissing(input: NearbyFetchMissingInput): Promise<NearbyFetchMissingResult> {
      const peerHaveRounds = new Map<string, number[]>();
      const archives: FinishedRoundArchive[] = [];
      const seenRounds = new Set<number>();
      let trustedWireCompleted = false;

      const hosts = [...memoryHosts].filter(
        (host) =>
          host.advertising &&
          normalizeRoomCode(host.handlers.gameId) === normalizeRoomCode(input.gameId) &&
          host.handlers.uid !== input.selfUid,
      );

      const byUid = new Map(hosts.map((host) => [host.handlers.uid, host]));
      const order = [
        ...input.candidateUids.filter((uid) => byUid.has(uid)),
        ...hosts
          .map((host) => host.handlers.uid)
          .filter((uid) => !input.candidateUids.includes(uid)),
      ];

      // Contact every discovered host (multi-host HaveAck) — do not stop after gaps fill.
      for (const uid of order) {
        const host = byUid.get(uid);
        if (!host) {
          continue;
        }
        const have = await Promise.resolve(host.handlers.getHaveRounds());
        peerHaveRounds.set(uid, have);
        input.onPeerHello?.(uid, have);
        const want = sanitizeWantRounds(input.wantRounds);
        if (!want) {
          continue;
        }
        const wantMsg = createWantMessage(input.gameId, input.selfUid, want);
        if (
          !isAuthorizedNearbyRequester({
            messageGameId: wantMsg.gameId,
            messageUid: wantMsg.uid,
            sessionGameId: host.handlers.gameId,
            rosterUids: host.handlers.getRosterUids(),
          })
        ) {
          continue;
        }
        const served = await host.handlers.getArchivesForRounds(want);
        const received: FinishedRoundArchive[] = [];
        for (const archive of served) {
          const stripped = stripArchiveForTransfer(archive);
          if (!isPeerArchiveWithinWireLimit(stripped)) {
            continue;
          }
          received.push(stripped);
          if (!seenRounds.has(stripped.baseWordRound)) {
            archives.push(stripped);
            seenRounds.add(stripped.baseWordRound);
          }
        }
        const ackRounds = clientHaveAckRoundsFromReceived(received);
        const ack = createHaveAckMessage(input.gameId, input.selfUid, ackRounds);
        if (ackRounds.length > 0) {
          host.handlers.onHaveAck?.(ack.uid, ack.haveRounds, 'tcp');
          trustedWireCompleted = true;
        }
      }

      return { archives, peerHaveRounds, trustedWireCompleted };
    },
    async announceHaveAck(gameId, uid, haveRounds) {
      for (const host of memoryHosts) {
        if (normalizeRoomCode(host.handlers.gameId) !== normalizeRoomCode(gameId)) {
          continue;
        }
        if (
          !isAuthorizedNearbyRequester({
            messageGameId: gameId,
            messageUid: uid,
            sessionGameId: host.handlers.gameId,
            rosterUids: host.handlers.getRosterUids(),
          })
        ) {
          continue;
        }
        host.handlers.onHaveAck?.(uid, haveRounds, 'udp');
      }
    },
  };
}

/** Test helper */
export function resetMemoryNearbyHostsForTests(): void {
  memoryHosts.clear();
}
