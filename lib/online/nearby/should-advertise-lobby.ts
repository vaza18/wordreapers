import type { GameSessionPlayer } from '../../firebase/types.js';

import { PeerHaveRoundsMap } from './peer-have-rounds.js';

export interface ShouldAdvertiseLobbyInput {
  baseWordRound: number;
  selfUid: string;
  /** Online roster uids currently in the lobby (may include self). */
  onlineUids: readonly string[];
  /** Prior-round archives this device can serve (any length > 0 to be useful). */
  localPriorArchiveCount: number;
  peerHave: PeerHaveRoundsMap;
  gameId: string;
}

/**
 * Lobby host should advertise while some online peer has not HaveAck-completed
 * capped priors `0..min(N,MAX)-1`.
 */
export function shouldAdvertiseForLobbyRoster(input: ShouldAdvertiseLobbyInput): boolean {
  const { baseWordRound, selfUid, onlineUids, localPriorArchiveCount, peerHave, gameId } = input;
  if (baseWordRound <= 0 || localPriorArchiveCount <= 0 || !selfUid) {
    return false;
  }
  const others = onlineUids.filter((uid) => uid && uid !== selfUid);
  if (others.length === 0) {
    return false;
  }
  return others.some((uid) => !peerHave.isComplete(gameId, uid, baseWordRound));
}

/** Online player uids from a session players map. */
export function onlinePlayerUids(
  players: Record<string, GameSessionPlayer | undefined> | null | undefined,
): string[] {
  if (!players) {
    return [];
  }
  return Object.entries(players)
    .filter(([, player]) => player?.online === true)
    .map(([uid]) => uid)
    .sort((a, b) => a.localeCompare(b));
}
