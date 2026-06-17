import type { GameSession } from '../firebase/types.js';

/** Player shown in a word-overlap tooltip (same word as viewer). */
export interface WordOverlapPeer {
  playerId: string;
  name: string;
  avatarColorIndex: number;
}

function peerFromSession(session: GameSession, playerId: string): WordOverlapPeer {
  const player = session.players[playerId];
  return {
    playerId,
    name: player?.name ?? playerId,
    avatarColorIndex: player?.avatarColorIndex ?? 0,
  };
}

function sortPeers(peers: WordOverlapPeer[]): WordOverlapPeer[] {
  return [...peers].sort((a, b) => a.name.localeCompare(b.name, 'uk'));
}

/**
 * Other players who submitted the same normalized word (live session).
 */
export function overlapPeersFromSession(
  normalized: string,
  session: GameSession,
  viewerPlayerId: string,
): WordOverlapPeer[] {
  const globalCount = session.wordCounts?.[normalized] ?? 1;
  if (globalCount <= 1) {
    return [];
  }

  const peerIds = session.wordPlayers?.[normalized];
  if (peerIds) {
    return sortPeers(
      Object.keys(peerIds)
        .filter((playerId) => playerId !== viewerPlayerId)
        .map((playerId) => peerFromSession(session, playerId)),
    );
  }

  const firstUid = session.wordFirst?.[normalized];
  if (firstUid && firstUid !== viewerPlayerId) {
    return [peerFromSession(session, firstUid)];
  }

  return [];
}

/**
 * Other players who submitted the same word (results / offline recompute).
 */
export function overlapPeersFromWordMap(
  normalized: string,
  playerId: string,
  wordsByPlayer: ReadonlyMap<string, readonly string[]>,
  nameForPlayer: (id: string) => string,
  avatarForPlayer: (id: string) => number,
): WordOverlapPeer[] {
  const peers: WordOverlapPeer[] = [];
  for (const [peerId, words] of wordsByPlayer) {
    if (peerId === playerId) {
      continue;
    }
    if (words.includes(normalized)) {
      peers.push({
        playerId: peerId,
        name: nameForPlayer(peerId),
        avatarColorIndex: avatarForPlayer(peerId),
      });
    }
  }
  return sortPeers(peers);
}
