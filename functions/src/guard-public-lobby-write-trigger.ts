import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

import {
  loadPublicBaseWordAllowlist,
  resolvePublicLobbyWriteAction,
  validatePublicLobbyEntry,
  type PublicLobbyCountDelta,
  type PublicLobbyEntry,
} from './guard-public-lobby-write.js';

export type { PublicLobbyCountDelta, PublicLobbyWriteAction } from './guard-public-lobby-write.js';
export { resolvePublicLobbyWriteAction } from './guard-public-lobby-write.js';

/** Apply counter delta via RTDB transaction (admin SDK). */
async function applyCountDelta(language: string, delta: PublicLobbyCountDelta): Promise<void> {
  if (delta === 0) {
    return;
  }
  const countRef = admin.database().ref(`public_lobby_counts/${language}`);
  await countRef.transaction((current) => {
    const prev = typeof current === 'number' ? current : 0;
    return Math.max(0, prev + delta);
  });
}

/**
 * Validate index writes and maintain `public_lobby_counts` (RTDB rules cannot read dictionaries).
 */
export async function guardPublicLobbyWriteHandler(
  language: string,
  gameId: string,
  before: PublicLobbyEntry | null | undefined,
  after: PublicLobbyEntry | null | undefined,
  now = Date.now(),
): Promise<void> {
  const allowlist = loadPublicBaseWordAllowlist();
  const action = resolvePublicLobbyWriteAction(before, after, allowlist, now);

  if (action.rejectAfter) {
    const gate = validatePublicLobbyEntry(after!, allowlist, now);
    logger.warn('guardPublicLobbyWrite: rejected entry', {
      language,
      gameId,
      reason: gate.ok ? 'UNKNOWN' : gate.reason,
    });
    await admin.database().ref(`public_lobbies/${language}/${gameId}`).remove();
  }

  await applyCountDelta(language, action.countDelta);
}
