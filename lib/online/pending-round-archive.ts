import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizeRoomCode } from '../firebase/room-code.js';

import { onlineRoundKey } from './processed-online-rounds.js';

const PENDING_ARCHIVES_KEY = 'wordreapers.pendingFinishedArchives';

export interface PendingRoundArchive {
  gameId: string;
  baseWordRound: number;
  uid: string;
  markedAt: number;
}

type PendingArchiveStore = Record<string, PendingRoundArchive>;

async function readStore(): Promise<PendingArchiveStore> {
  const raw = await AsyncStorage.getItem(PENDING_ARCHIVES_KEY);
  if (raw == null || raw === '') {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(String(raw));
    if (parsed == null || typeof parsed !== 'object') {
      return {};
    }
    return parsed as PendingArchiveStore;
  } catch {
    return {};
  }
}

async function writeStore(store: PendingArchiveStore): Promise<void> {
  await AsyncStorage.setItem(PENDING_ARCHIVES_KEY, JSON.stringify(store));
}

/** Remember that this device left early and still needs a finished-round archive. */
export async function markPendingRoundArchive(
  gameId: string,
  baseWordRound: number,
  uid: string,
): Promise<void> {
  const store = await readStore();
  const key = onlineRoundKey(gameId, baseWordRound);
  store[key] = {
    gameId: normalizeRoomCode(gameId),
    baseWordRound,
    uid,
    markedAt: Date.now(),
  };
  await writeStore(store);
}

export async function listPendingRoundArchives(): Promise<PendingRoundArchive[]> {
  const store = await readStore();
  return Object.values(store).sort((a, b) => b.markedAt - a.markedAt);
}

export async function clearPendingRoundArchive(
  gameId: string,
  baseWordRound: number,
): Promise<void> {
  const store = await readStore();
  delete store[onlineRoundKey(gameId, baseWordRound)];
  await writeStore(store);
}
