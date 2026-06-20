import AsyncStorage from '@react-native-async-storage/async-storage';

import type { StoredPlayerWord } from '../firebase/player-words-service.js';
import type { GameSession } from '../firebase/types.js';
import { normalizeRoomCode } from '../firebase/room-code.js';

import type { AllPlayerWords } from './clone-player-words.js';

const FINISHED_ARCHIVES_KEY = 'wordreapers.finishedOnlineRounds';
const MAX_FINISHED_ARCHIVES = 40;

export const FINISHED_ARCHIVE_VERSION = 2 as const;

export interface FinishedRoundArchive {
  gameId: string;
  baseWordRound: number;
  savedAt: number;
  session: GameSession;
  playerWords: Record<string, Record<string, StoredPlayerWord>>;
  /** Schema version for forward-compatible migrations. */
  archiveVersion?: typeof FINISHED_ARCHIVE_VERSION;
  /** True after this device saved the final local archive (`ackSent`). */
  ackSent?: boolean;
  /** Snapshot of RTDB `players[*].wordCount` when archived — used for staleness checks. */
  playerWordCounts?: Record<string, number>;
}

export interface PlayingRoundSnapshot {
  baseWord: string;
  settings: GameSession['settings'];
  players: GameSession['players'];
  wordFirst?: GameSession['wordFirst'];
  wordPlayers?: GameSession['wordPlayers'];
  pauseState?: GameSession['pauseState'];
  timerEndsAt: number;
  roundStartedAt?: number;
  roundTimerBudgetSeconds?: number;
  organizerId: string;
  baseWordRound: number;
  baseWordPickerOrder?: string[];
}

type FinishedArchiveStore = Record<string, FinishedRoundArchive>;

function finishedArchiveKey(gameId: string, baseWordRound: number): string {
  return `${normalizeRoomCode(gameId)}:${baseWordRound}`;
}

function serializeAllPlayerWords(
  words: AllPlayerWords,
): Record<string, Record<string, StoredPlayerWord>> {
  const record: Record<string, Record<string, StoredPlayerWord>> = {};
  for (const [playerId, playerWords] of words) {
    record[playerId] = Object.fromEntries(playerWords);
  }
  return record;
}

/** Build word-count map from a live or archived session for staleness comparison. */
export function playerWordCountsFromSession(session: GameSession): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [playerId, player] of Object.entries(session.players)) {
    counts[playerId] = player.wordCount ?? 0;
  }
  return counts;
}

function wordCountsMatch(
  archiveCounts: Record<string, number> | undefined,
  session: GameSession,
): boolean {
  const expected = playerWordCountsFromSession(session);
  const actual = archiveCounts ?? {};
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const key of keys) {
    if ((expected[key] ?? 0) !== (actual[key] ?? 0)) {
      return false;
    }
  }
  return true;
}

/** True when the local archive should be refreshed from RTDB. */
export function isFinishedArchiveStale(
  archive: FinishedRoundArchive | null,
  session: GameSession,
): boolean {
  if (!archive) {
    return true;
  }
  if (archive.session.status !== 'finished' || session.status !== 'finished') {
    return true;
  }
  if ((archive.baseWordRound ?? 0) !== (session.baseWordRound ?? 0)) {
    return true;
  }
  return !wordCountsMatch(archive.playerWordCounts, session);
}

async function readFinishedStore(): Promise<FinishedArchiveStore> {
  const raw = await AsyncStorage.getItem(FINISHED_ARCHIVES_KEY);
  if (raw == null || raw === '') {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(String(raw));
    if (parsed == null || typeof parsed !== 'object') {
      return {};
    }
    return parsed as FinishedArchiveStore;
  } catch {
    return {};
  }
}

async function writeFinishedStore(store: FinishedArchiveStore): Promise<void> {
  await AsyncStorage.setItem(FINISHED_ARCHIVES_KEY, JSON.stringify(store));
}

function trimFinishedStore(store: FinishedArchiveStore): FinishedArchiveStore {
  const entries = Object.entries(store).sort(([, a], [, b]) => b.savedAt - a.savedAt);
  if (entries.length <= MAX_FINISHED_ARCHIVES) {
    return store;
  }
  return Object.fromEntries(entries.slice(0, MAX_FINISHED_ARCHIVES));
}

export function playingRoundSnapshotFromSession(session: GameSession): PlayingRoundSnapshot | null {
  if (session.status !== 'playing' || typeof session.roundStartedAt !== 'number') {
    return null;
  }
  return {
    baseWord: session.baseWord,
    settings: session.settings,
    players: session.players,
    wordFirst: session.wordFirst,
    wordPlayers: session.wordPlayers,
    pauseState: session.pauseState,
    timerEndsAt: session.timerEndsAt ?? session.roundStartedAt,
    roundStartedAt: session.roundStartedAt,
    roundTimerBudgetSeconds: session.roundTimerBudgetSeconds ?? undefined,
    organizerId: session.organizerId,
    baseWordRound: session.baseWordRound ?? 0,
    baseWordPickerOrder: session.baseWordPickerOrder,
  };
}

export async function saveFinishedRoundArchive(
  gameId: string,
  session: GameSession,
  words: AllPlayerWords,
): Promise<void> {
  if (session.status !== 'finished') {
    return;
  }
  const baseWordRound = session.baseWordRound ?? 0;
  const store = await readFinishedStore();
  const existing = store[finishedArchiveKey(gameId, baseWordRound)];
  store[finishedArchiveKey(gameId, baseWordRound)] = {
    gameId: normalizeRoomCode(gameId),
    baseWordRound,
    savedAt: Date.now(),
    session,
    playerWords: serializeAllPlayerWords(words),
    archiveVersion: FINISHED_ARCHIVE_VERSION,
    ackSent: existing?.ackSent === true ? true : false,
    playerWordCounts: playerWordCountsFromSession(session),
  };
  await writeFinishedStore(trimFinishedStore(store));
}

/** Mark that the local finished-round archive is complete on this device. */
export async function markFinishedArchiveAckSent(
  gameId: string,
  baseWordRound: number,
): Promise<void> {
  const store = await readFinishedStore();
  const key = finishedArchiveKey(gameId, baseWordRound);
  const entry = store[key];
  if (!entry) {
    return;
  }
  store[key] = { ...entry, ackSent: true };
  await writeFinishedStore(store);
}

export async function getFinishedRoundArchive(
  gameId: string,
  baseWordRound: number,
): Promise<FinishedRoundArchive | null> {
  const store = await readFinishedStore();
  return store[finishedArchiveKey(gameId, baseWordRound)] ?? null;
}

/** URL-safe key for expo-router (`{roomCode}--{baseWordRound}`). */
export function archiveRouteKey(gameId: string, baseWordRound: number): string {
  return `${normalizeRoomCode(gameId)}--${baseWordRound}`;
}

export function parseArchiveRouteKey(
  routeKey: string,
): { gameId: string; baseWordRound: number } | null {
  const separator = routeKey.lastIndexOf('--');
  if (separator <= 0) {
    return null;
  }
  const gameId = routeKey.slice(0, separator);
  const baseWordRound = Number(routeKey.slice(separator + 2));
  if (!Number.isFinite(baseWordRound) || baseWordRound < 0) {
    return null;
  }
  return { gameId, baseWordRound: Math.floor(baseWordRound) };
}

/** Newest finished rounds saved on this device. */
export async function listFinishedRoundArchives(): Promise<FinishedRoundArchive[]> {
  const store = await readFinishedStore();
  return Object.values(store).sort((a, b) => b.savedAt - a.savedAt);
}

/** Latest finished round archive for a room on this device, if any. */
export async function latestFinishedArchiveForGame(
  gameId: string,
): Promise<FinishedRoundArchive | null> {
  const normalized = normalizeRoomCode(gameId);
  const archives = await listFinishedRoundArchives();
  return archives.find((archive) => archive.gameId === normalized) ?? null;
}
