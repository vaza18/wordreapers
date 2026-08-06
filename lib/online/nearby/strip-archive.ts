import type { FinishedRoundArchive } from '../session/online-session-archive.js';
import { FINISHED_ARCHIVE_VERSION } from '../session/online-session-archive.js';
import { normalizeRoomCode } from '../../firebase/room-code.js';

/** Max JSON characters accepted for a single peer archive on the wire. */
export const MAX_PEER_ARCHIVE_JSON_CHARS = 400_000;

export function peerArchiveJsonCharLength(archive: unknown): number {
  try {
    return JSON.stringify(archive).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function isPeerArchiveWithinWireLimit(archive: unknown): boolean {
  return peerArchiveJsonCharLength(archive) <= MAX_PEER_ARCHIVE_JSON_CHARS;
}

/** Wire payload: drop lexicon and ack flags. */
export function stripArchiveForTransfer(
  archive: FinishedRoundArchive,
): Omit<FinishedRoundArchive, 'playableLexicon'> {
  const { playableLexicon, ...rest } = archive;
  void playableLexicon;
  return {
    ...rest,
    gameId: normalizeRoomCode(archive.gameId),
    ackSent: false,
    archiveVersion: archive.archiveVersion ?? FINISHED_ARCHIVE_VERSION,
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function isValidPeerArchiveShape(raw: unknown): raw is FinishedRoundArchive {
  if (!raw || typeof raw !== 'object') {
    return false;
  }
  const archive = raw as Partial<FinishedRoundArchive>;
  if (typeof archive.gameId !== 'string' || !archive.gameId) {
    return false;
  }
  if (typeof archive.baseWordRound !== 'number' || !Number.isFinite(archive.baseWordRound)) {
    return false;
  }
  if (archive.baseWordRound < 0 || !Number.isInteger(archive.baseWordRound)) {
    return false;
  }
  if (typeof archive.savedAt !== 'number' || !Number.isFinite(archive.savedAt)) {
    return false;
  }
  if (!archive.session || typeof archive.session !== 'object') {
    return false;
  }
  if (archive.session.status !== 'finished') {
    return false;
  }
  if (typeof archive.session.baseWord !== 'string' || !archive.session.baseWord.trim()) {
    return false;
  }
  if (
    typeof archive.session.baseWordRound !== 'number' ||
    archive.session.baseWordRound !== archive.baseWordRound
  ) {
    return false;
  }
  if (!archive.session.settings || typeof archive.session.settings !== 'object') {
    return false;
  }
  if (!archive.session.players || typeof archive.session.players !== 'object') {
    return false;
  }
  const sessionGameId = (archive.session as { gameId?: unknown }).gameId;
  if (typeof sessionGameId === 'string' && sessionGameId) {
    if (normalizeRoomCode(sessionGameId) !== normalizeRoomCode(archive.gameId)) {
      return false;
    }
  }
  if (!archive.playerWords || typeof archive.playerWords !== 'object') {
    return false;
  }
  for (const words of Object.values(archive.playerWords)) {
    if (!isStringArray(words)) {
      return false;
    }
  }
  if (archive.playerWordCounts != null) {
    if (typeof archive.playerWordCounts !== 'object') {
      return false;
    }
    for (const count of Object.values(archive.playerWordCounts)) {
      if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
        return false;
      }
    }
  }
  if (!isPeerArchiveWithinWireLimit(raw)) {
    return false;
  }
  return true;
}
