import { normalizeRoomCode } from '../../firebase/room-code.js';
import { importFinishedRoundArchiveIfAbsent } from '../session/online-session-archive.js';

import { isValidPeerArchiveShape, stripArchiveForTransfer } from './strip-archive.js';

export type ImportPeerArchiveOptions = {
  /** Expected room — reject archives for other gameIds. */
  expectedGameId: string;
  /** Only these prior rounds may be imported. */
  allowedRounds: ReadonlySet<number> | readonly number[];
};

function isAllowedRound(round: number, allowed: ReadonlySet<number> | readonly number[]): boolean {
  const set = allowed instanceof Set ? allowed : new Set(allowed);
  return set.has(round);
}

/**
 * Persist a peer-provided finished round for room history (no lexicon, no sync-coordinator ack).
 * Skips if a local archive for the same gameId+round already exists.
 * @returns true when a new archive was written
 */
export async function importPeerFinishedRoundArchive(
  raw: unknown,
  options: ImportPeerArchiveOptions,
): Promise<boolean> {
  if (!isValidPeerArchiveShape(raw)) {
    return false;
  }
  const expected = normalizeRoomCode(options.expectedGameId);
  const stripped = stripArchiveForTransfer(raw);
  if (normalizeRoomCode(stripped.gameId) !== expected) {
    return false;
  }
  if (!isAllowedRound(stripped.baseWordRound, options.allowedRounds)) {
    return false;
  }
  return importFinishedRoundArchiveIfAbsent(stripped);
}
