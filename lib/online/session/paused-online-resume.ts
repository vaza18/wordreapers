import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizeRoomCode } from '../../firebase/room-code.js';
import type { GameSession } from '../../firebase/types.js';

export const PAUSED_ONLINE_RESUME_KEY = 'wordreapers.pausedOnlineResume';

/** Local pointer so cold start can reopen a still-paused multiplayer room. */
export interface PausedOnlineResumePointer {
  gameId: string;
  baseWordRound: number;
  uid: string;
}

export function parsePausedOnlineResume(raw: unknown): PausedOnlineResumePointer | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const row = raw as Record<string, unknown>;
  if (typeof row.gameId !== 'string' || row.gameId.length === 0) {
    return null;
  }
  if (typeof row.baseWordRound !== 'number' || !Number.isFinite(row.baseWordRound)) {
    return null;
  }
  if (typeof row.uid !== 'string' || row.uid.length === 0) {
    return null;
  }
  return {
    gameId: normalizeRoomCode(row.gameId),
    baseWordRound: row.baseWordRound,
    uid: row.uid,
  };
}

export async function savePausedOnlineResume(pointer: PausedOnlineResumePointer): Promise<void> {
  const normalized: PausedOnlineResumePointer = {
    gameId: normalizeRoomCode(pointer.gameId),
    baseWordRound: pointer.baseWordRound,
    uid: pointer.uid,
  };
  await AsyncStorage.setItem(PAUSED_ONLINE_RESUME_KEY, JSON.stringify(normalized));
}

export async function clearPausedOnlineResume(): Promise<void> {
  await AsyncStorage.removeItem(PAUSED_ONLINE_RESUME_KEY);
}

export async function loadPausedOnlineResume(): Promise<PausedOnlineResumePointer | null> {
  const raw = await AsyncStorage.getItem(PAUSED_ONLINE_RESUME_KEY);
  if (raw == null || raw === '') {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(String(raw));
    const pointer = parsePausedOnlineResume(parsed);
    if (!pointer) {
      await clearPausedOnlineResume();
      return null;
    }
    return pointer;
  } catch {
    await clearPausedOnlineResume();
    return null;
  }
}

/**
 * True when RTDB still has this player's paused playing round (dinner scenario).
 * Never resumes an unpaused live round.
 */
export function shouldResumePausedOnline(
  pointer: PausedOnlineResumePointer,
  session: GameSession | null,
  uid: string,
): boolean {
  if (!session || session.status !== 'playing') {
    return false;
  }
  if (!session.pauseState?.active) {
    return false;
  }
  if (pointer.uid !== uid) {
    return false;
  }
  if ((session.baseWordRound ?? 0) !== pointer.baseWordRound) {
    return false;
  }
  if (!session.players[uid]) {
    return false;
  }
  return true;
}

/** Upsert pointer when the live session is paused for this player. */
export async function syncPausedOnlineResumePointer(
  gameId: string,
  uid: string,
  session: GameSession | null | undefined,
): Promise<void> {
  if (!session || session.status !== 'playing' || !session.pauseState?.active || !uid) {
    return;
  }
  if (!session.players[uid]) {
    return;
  }
  await savePausedOnlineResume({
    gameId,
    baseWordRound: session.baseWordRound ?? 0,
    uid,
  });
}
