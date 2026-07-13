import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizeRoomCode } from '../../firebase/room-code.js';
import type { GameSession } from '../../firebase/types.js';

export const LEFT_ONLINE_RESUME_KEY = 'wordreapers.leftOnlineResume';

/** Local pointer so cold start can reopen the left-round screen (rejoin / results). */
export interface LeftOnlineResumePointer {
  gameId: string;
  baseWordRound: number;
  uid: string;
}

/** Validate unknown JSON into a left-round resume pointer. */
export function parseLeftOnlineResume(raw: unknown): LeftOnlineResumePointer | null {
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

/** Persist the left-round resume pointer. */
export async function saveLeftOnlineResume(pointer: LeftOnlineResumePointer): Promise<void> {
  const normalized: LeftOnlineResumePointer = {
    gameId: normalizeRoomCode(pointer.gameId),
    baseWordRound: pointer.baseWordRound,
    uid: pointer.uid,
  };
  await AsyncStorage.setItem(LEFT_ONLINE_RESUME_KEY, JSON.stringify(normalized));
}

/** Remove any left-round resume pointer. */
export async function clearLeftOnlineResume(): Promise<void> {
  await AsyncStorage.removeItem(LEFT_ONLINE_RESUME_KEY);
}

/** Load and validate the left-round resume pointer, clearing corrupt data. */
export async function loadLeftOnlineResume(): Promise<LeftOnlineResumePointer | null> {
  const raw = await AsyncStorage.getItem(LEFT_ONLINE_RESUME_KEY);
  if (raw == null || raw === '') {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(String(raw));
    const pointer = parseLeftOnlineResume(parsed);
    if (!pointer) {
      await clearLeftOnlineResume();
      return null;
    }
    return pointer;
  } catch {
    await clearLeftOnlineResume();
    return null;
  }
}

/**
 * True when RTDB still has this room/player so the left screen can show rejoin or results.
 * Does not require `playing` — finished/rematch left UI is handled on the screen.
 */
export function shouldResumeLeftOnline(
  pointer: LeftOnlineResumePointer,
  session: GameSession | null,
  uid: string,
): boolean {
  if (!session) {
    return false;
  }
  if (pointer.uid !== uid) {
    return false;
  }
  if (!session.players[uid]) {
    return false;
  }
  return true;
}

/** Upsert pointer while the viewer is parked on the left-round screen. */
export async function syncLeftOnlineResumePointer(
  gameId: string,
  uid: string,
  baseWordRound: number,
  session: GameSession | null | undefined,
): Promise<void> {
  if (!uid || !session?.players[uid]) {
    return;
  }
  await saveLeftOnlineResume({
    gameId,
    baseWordRound,
    uid,
  });
}
