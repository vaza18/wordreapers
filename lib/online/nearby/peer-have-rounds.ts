import { normalizeRoomCode } from '../../firebase/room-code.js';

import { haveRoundsCompleteForN, normalizeHaveRounds } from './missing-round-archives.js';

export type HaveRoundsTrust = 'trusted' | 'untrusted';

type PeerHaveEntry = {
  haveRounds: number[];
  trust: HaveRoundsTrust;
};

/**
 * In-memory map of which peers reported having which prior rounds (Hello / HaveAck).
 * Only **trusted** (TCP/BLE GATT after authorized Want) completeness may stop lobby advertise —
 * UDP and bare TCP HaveAck are spoofable.
 */
export class PeerHaveRoundsMap {
  private readonly byGame = new Map<string, Map<string, PeerHaveEntry>>();

  clearGame(gameId: string): void {
    this.byGame.delete(normalizeRoomCode(gameId));
  }

  clearAll(): void {
    this.byGame.clear();
  }

  setHaveRounds(
    gameId: string,
    uid: string,
    haveRounds: readonly number[],
    trust: HaveRoundsTrust,
  ): void {
    if (!uid) {
      return;
    }
    const normalized = normalizeRoomCode(gameId);
    let peers = this.byGame.get(normalized);
    if (!peers) {
      peers = new Map();
      this.byGame.set(normalized, peers);
    }
    const existing = peers.get(uid);
    // Ignore UDP/untrusted updates once a TCP-trusted snapshot exists (anti-spoof).
    if (existing?.trust === 'trusted' && trust === 'untrusted') {
      return;
    }
    const nextRounds =
      existing?.trust === 'trusted' && trust === 'trusted'
        ? normalizeHaveRounds([...existing.haveRounds, ...haveRounds])
        : normalizeHaveRounds(haveRounds);
    peers.set(uid, {
      haveRounds: nextRounds,
      trust,
    });
  }

  getHaveRounds(gameId: string, uid: string): number[] | undefined {
    return this.byGame.get(normalizeRoomCode(gameId))?.get(uid)?.haveRounds;
  }

  /** Completeness for lobby advertise stop — TCP-trusted only. */
  isComplete(gameId: string, uid: string, baseWordRound: number): boolean {
    const entry = this.byGame.get(normalizeRoomCode(gameId))?.get(uid);
    if (entry === undefined || entry.trust !== 'trusted') {
      return false;
    }
    return haveRoundsCompleteForN(baseWordRound, entry.haveRounds);
  }
}

/** Shared session-scoped peer have-rounds (one map per JS runtime). */
export const peerHaveRoundsMap = new PeerHaveRoundsMap();
