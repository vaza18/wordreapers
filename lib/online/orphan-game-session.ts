import type { GameSession } from '../firebase/types.js';

export type RematchRtdbPresence = 'missing' | 'waiting' | 'finished' | 'playing';

/** Leftover RTDB node: only `players/{uid}/online` after session delete + onDisconnect. */
export function isOrphanGameSessionShell(data: unknown): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const session = data as Record<string, unknown>;
  return session.status === undefined && session.organizerId === undefined;
}

export function orphanShellHasPlayer(session: unknown, uid: string): boolean {
  if (!isOrphanGameSessionShell(session)) {
    return false;
  }
  const players = (session as GameSession).players ?? {};
  return players[uid] != null;
}

/** Treat orphan shells as absent so rematch can recreate the session. */
export function resolveRematchRtdbPresence(data: unknown): RematchRtdbPresence {
  if (data == null) {
    return 'missing';
  }
  if (isOrphanGameSessionShell(data)) {
    return 'missing';
  }
  const status = (data as GameSession).status;
  if (status === 'waiting' || status === 'finished' || status === 'playing') {
    return status;
  }
  return 'missing';
}
