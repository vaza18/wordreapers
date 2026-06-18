import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizeRoomCode } from '../firebase/room-code.js';

const STORAGE_KEY = 'wordreapers.processedOnlineRounds';

export function onlineRoundKey(gameId: string, baseWordRound: number): string {
  return `${normalizeRoomCode(gameId)}:${baseWordRound}`;
}

async function readKeys(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return new Set();
  }
  try {
    const list: unknown = JSON.parse(String(raw));
    if (!Array.isArray(list)) {
      return new Set();
    }
    return new Set(list.filter((item): item is string => typeof item === 'string'));
  } catch {
    return new Set();
  }
}

export async function wasOnlineRoundProcessed(roundKey: string): Promise<boolean> {
  const keys = await readKeys();
  return keys.has(roundKey);
}

export async function markOnlineRoundProcessed(roundKey: string): Promise<void> {
  const keys = await readKeys();
  keys.add(roundKey);
  const trimmed = [...keys].slice(-200);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}
