import AsyncStorage from '@react-native-async-storage/async-storage';

import type { StoredPlayerWord } from '../firebase/player-words-service.js';
import { normalizeRoomCode } from '../firebase/room-code.js';
import type { PlayingRoundSnapshot } from './online-session-archive.js';

const STORAGE_KEY = 'wordreapers.activeOnlineRounds';

export interface ActiveRoundCacheEntry {
  gameId: string;
  baseWordRound: number;
  timerEndsAt: number;
  words: Record<string, StoredPlayerWord>;
  /** Session snapshot for rejoin while the round timer is still running. */
  sessionSnapshot?: PlayingRoundSnapshot;
}

type CacheStore = Record<string, ActiveRoundCacheEntry>;

function cacheKey(gameId: string, baseWordRound: number): string {
  return `${normalizeRoomCode(gameId)}:${baseWordRound}`;
}

async function readStore(): Promise<CacheStore> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw == null || raw === '') {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(String(raw));
    if (parsed == null || typeof parsed !== 'object') {
      return {};
    }
    return parsed as CacheStore;
  } catch {
    return {};
  }
}

async function writeStore(store: CacheStore): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export async function saveActiveRoundCache(entry: ActiveRoundCacheEntry): Promise<void> {
  const store = await readStore();
  store[cacheKey(entry.gameId, entry.baseWordRound)] = entry;
  await writeStore(store);
}

export async function removeActiveRoundCache(gameId: string, baseWordRound: number): Promise<void> {
  const store = await readStore();
  delete store[cacheKey(gameId, baseWordRound)];
  await writeStore(store);
}

/** Drop every parked round for a room (rematch, abandon, or round finished). */
export async function clearAllActiveRoundCachesForGame(gameId: string): Promise<void> {
  const store = await readStore();
  const normalized = normalizeRoomCode(gameId);
  let changed = false;
  for (const [key, entry] of Object.entries(store)) {
    if (normalizeRoomCode(entry.gameId) === normalized) {
      delete store[key];
      changed = true;
    }
  }
  if (changed) {
    await writeStore(store);
  }
}

export async function getActiveRoundCache(
  gameId: string,
  baseWordRound: number,
): Promise<ActiveRoundCacheEntry | null> {
  const store = await readStore();
  return store[cacheKey(gameId, baseWordRound)] ?? null;
}

export function canRestorePlayingRoundFromCache(
  entry: ActiveRoundCacheEntry | null,
  serverNow: number,
): entry is ActiveRoundCacheEntry & { sessionSnapshot: PlayingRoundSnapshot } {
  return entry != null && entry.sessionSnapshot != null && entry.timerEndsAt > serverNow;
}

/** Most recent non-expired parked round for a room (any baseWordRound). */
export async function findActiveRoundCacheForGame(
  gameId: string,
  serverNow: number,
): Promise<ActiveRoundCacheEntry | null> {
  const store = await readStore();
  const normalized = normalizeRoomCode(gameId);
  let best: ActiveRoundCacheEntry | null = null;
  for (const entry of Object.values(store)) {
    if (normalizeRoomCode(entry.gameId) !== normalized) {
      continue;
    }
    if (entry.timerEndsAt <= serverNow) {
      continue;
    }
    if (!entry.sessionSnapshot) {
      continue;
    }
    if (!best || entry.baseWordRound > best.baseWordRound) {
      best = entry;
    }
  }
  return best;
}

/** Drop parked rounds whose timer has ended (player never returned). */
export async function purgeExpiredActiveRoundCaches(serverNow: number): Promise<void> {
  const store = await readStore();
  let changed = false;
  for (const [key, entry] of Object.entries(store)) {
    if (entry.timerEndsAt <= serverNow) {
      delete store[key];
      changed = true;
    }
  }
  if (changed) {
    await writeStore(store);
  }
}

export function wordsMapFromCache(entry: ActiveRoundCacheEntry): Map<string, StoredPlayerWord> {
  const map = new Map<string, StoredPlayerWord>();
  for (const [normalized, row] of Object.entries(entry.words)) {
    if (row && typeof row.display === 'string') {
      map.set(normalized, row);
    }
  }
  return map;
}

export function wordsRecordFromMap(
  words: Map<string, StoredPlayerWord>,
): Record<string, StoredPlayerWord> {
  const record: Record<string, StoredPlayerWord> = {};
  for (const [key, value] of words) {
    record[key] = value;
  }
  return record;
}
