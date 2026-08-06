import { normalizeRoomCode } from '../../firebase/room-code.js';

import { normalizeHaveRounds } from './missing-round-archives.js';

export const NEARBY_ARCHIVE_PROTOCOL_VERSION = 1 as const;

export type NearbyHelloMessage = {
  type: 'hello';
  v: typeof NEARBY_ARCHIVE_PROTOCOL_VERSION;
  gameId: string;
  uid: string;
  haveRounds: number[];
};

export type NearbyWantMessage = {
  type: 'want';
  gameId: string;
  uid: string;
  wantRounds: number[];
};

export type NearbyHaveAckMessage = {
  type: 'haveAck';
  gameId: string;
  uid: string;
  haveRounds: number[];
};

export type NearbyArchivesMessage = {
  type: 'archives';
  gameId: string;
  /** One archive per message on the wire (multi-round = multiple lines). */
  archives: unknown[];
};

/** Host signals end of archive stream so client can HaveAck and close. */
export type NearbyArchivesEndMessage = {
  type: 'archivesEnd';
  gameId: string;
};

export type NearbyProtocolMessage =
  | NearbyHelloMessage
  | NearbyWantMessage
  | NearbyHaveAckMessage
  | NearbyArchivesMessage
  | NearbyArchivesEndMessage;

export function createHelloMessage(
  gameId: string,
  uid: string,
  haveRounds: readonly number[],
): NearbyHelloMessage {
  return {
    type: 'hello',
    v: NEARBY_ARCHIVE_PROTOCOL_VERSION,
    gameId: normalizeRoomCode(gameId),
    uid,
    haveRounds: normalizeHaveRounds(haveRounds),
  };
}

export function createWantMessage(
  gameId: string,
  uid: string,
  wantRounds: readonly number[],
): NearbyWantMessage {
  return {
    type: 'want',
    gameId: normalizeRoomCode(gameId),
    uid,
    wantRounds: normalizeHaveRounds(wantRounds),
  };
}

export function createHaveAckMessage(
  gameId: string,
  uid: string,
  haveRounds: readonly number[],
): NearbyHaveAckMessage {
  return {
    type: 'haveAck',
    gameId: normalizeRoomCode(gameId),
    uid,
    haveRounds: normalizeHaveRounds(haveRounds),
  };
}

/** Host-side auth for Want / HaveAck: gameId match + uid in roster. */
export function isAuthorizedNearbyRequester(input: {
  messageGameId: string;
  messageUid: string;
  sessionGameId: string;
  rosterUids: ReadonlySet<string> | readonly string[];
}): boolean {
  const { messageGameId, messageUid, sessionGameId, rosterUids } = input;
  if (!messageUid || normalizeRoomCode(messageGameId) !== normalizeRoomCode(sessionGameId)) {
    return false;
  }
  if (rosterUids instanceof Set) {
    return rosterUids.has(messageUid);
  }
  return (rosterUids as readonly string[]).includes(messageUid);
}

export function parseNearbyProtocolMessage(raw: unknown): NearbyProtocolMessage | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const type = record.type;
  if (type === 'hello') {
    if (record.v !== NEARBY_ARCHIVE_PROTOCOL_VERSION) {
      return null;
    }
    if (typeof record.gameId !== 'string' || typeof record.uid !== 'string') {
      return null;
    }
    if (!Array.isArray(record.haveRounds)) {
      return null;
    }
    return createHelloMessage(record.gameId, record.uid, record.haveRounds as number[]);
  }
  if (type === 'want') {
    if (typeof record.gameId !== 'string' || typeof record.uid !== 'string') {
      return null;
    }
    if (!Array.isArray(record.wantRounds)) {
      return null;
    }
    return createWantMessage(record.gameId, record.uid, record.wantRounds as number[]);
  }
  if (type === 'haveAck') {
    if (typeof record.gameId !== 'string' || typeof record.uid !== 'string') {
      return null;
    }
    if (!Array.isArray(record.haveRounds)) {
      return null;
    }
    return createHaveAckMessage(record.gameId, record.uid, record.haveRounds as number[]);
  }
  if (type === 'archives') {
    if (typeof record.gameId !== 'string' || !Array.isArray(record.archives)) {
      return null;
    }
    return {
      type: 'archives',
      gameId: normalizeRoomCode(record.gameId),
      archives: record.archives,
    };
  }
  if (type === 'archivesEnd') {
    if (typeof record.gameId !== 'string') {
      return null;
    }
    return {
      type: 'archivesEnd',
      gameId: normalizeRoomCode(record.gameId),
    };
  }
  return null;
}

export function createArchivesEndMessage(gameId: string): NearbyArchivesEndMessage {
  return {
    type: 'archivesEnd',
    gameId: normalizeRoomCode(gameId),
  };
}
