import AsyncStorage from '@react-native-async-storage/async-storage';

import type { GameSession } from '../../firebase/types.js';
import { normalizeRoomCode } from '../../firebase/room-code.js';
import { resolveGameSessionSettingsForSession } from '../../firebase/session-settings.js';
import { recomputeSessionPlayerScores } from '../../game/scoring.js';

import type { AllPlayerWords } from './clone-player-words.js';
import { playableLexiconSnapshotForSession } from '../playable-lexicon-archive.js';
import type { PlayableLexiconSnapshot } from '../../dictionary/round-playable-lexicon.js';
import { wordPlayersFromWordsByPlayer } from '../word-players-invert.js';
import {
  archiveHasPlayerWords,
  sessionWordPlayersRicherThanArchive,
} from './archive-words-gate.js';

const FINISHED_ARCHIVES_KEY = 'wordreapers.finishedOnlineRounds';
const MAX_FINISHED_ARCHIVES = 1000;
/** Embedded lexicon snapshots kept on the newest archives only; older rounds rebuild on view. */
const MAX_STORED_LEXICON_SNAPSHOTS = 40;

export { MAX_FINISHED_ARCHIVES, MAX_STORED_LEXICON_SNAPSHOTS };

export const FINISHED_ARCHIVE_VERSION = 4 as const;

export type { PlayableLexiconSnapshot };

export interface FinishedRoundArchive {
  gameId: string;
  baseWordRound: number;
  savedAt: number;
  session: GameSession;
  playerWords: Record<string, string[]>;
  /** Schema version for forward-compatible migrations. */
  archiveVersion?: typeof FINISHED_ARCHIVE_VERSION;
  /** True after this device saved the final local archive (`ackSent`). */
  ackSent?: boolean;
  /** Snapshot of per-player word counts from archived word lists — used for staleness checks. */
  playerWordCounts?: Record<string, number>;
  /** Playable words for this base word — avoids rebuild in history/results. */
  playableLexicon?: PlayableLexiconSnapshot;
}

export interface PlayingRoundSnapshot {
  baseWord: string;
  settings: GameSession['settings'];
  players: GameSession['players'];
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

function serializeAllPlayerWords(words: AllPlayerWords): Record<string, string[]> {
  const record: Record<string, string[]> = {};
  for (const [playerId, playerWords] of words) {
    record[playerId] = playerWords;
  }
  return record;
}

/** Build word-count map from archived / inverted word lists. */
export function playerWordCountsFromWords(
  words: AllPlayerWords | Record<string, string[]>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  if (words instanceof Map) {
    for (const [playerId, playerWords] of words) {
      counts[playerId] = playerWords.length;
    }
    return counts;
  }
  for (const [playerId, playerWords] of Object.entries(words)) {
    counts[playerId] = Array.isArray(playerWords) ? playerWords.length : 0;
  }
  return counts;
}

/** Stamp local archive session players with totals derived from word lists. */
export function sessionWithDerivedTotalsFromWords(
  session: GameSession,
  words: AllPlayerWords,
): GameSession {
  const wordPlayers = wordPlayersFromWordsByPlayer(words);
  const players = Object.fromEntries(
    Object.entries(session.players).map(([playerId, player]) => [playerId, { ...player }]),
  );
  const uniqueBonusEnabled = resolveGameSessionSettingsForSession(session).uniqueBonusEnabled;
  recomputeSessionPlayerScores({ players, wordPlayers }, uniqueBonusEnabled);
  return { ...session, players, wordPlayers };
}

/** Empty archive lists must not disagree with stored count snapshot. */
export function archivePlayerWordsDisagreeWithCounts(archive: FinishedRoundArchive): boolean {
  const counts = archive.playerWordCounts ?? playerWordCountsFromWords(archive.playerWords ?? {});
  const uids = new Set([...Object.keys(counts), ...Object.keys(archive.playerWords ?? {})]);
  for (const uid of uids) {
    const expected = counts[uid] ?? 0;
    const words = archive.playerWords?.[uid];
    const actual = Array.isArray(words) ? words.length : 0;
    if (actual !== expected) {
      return true;
    }
  }
  return false;
}

/**
 * Pre-v4 / object-shaped `playerWords` (old `{display,at}` leaves). UI shows empty
 * lists; do not refresh from maps — a wiped RTDB would overwrite disk with [].
 */
export function isLegacyFinishedArchiveWords(archive: FinishedRoundArchive): boolean {
  if (archive.archiveVersion != null && archive.archiveVersion < FINISHED_ARCHIVE_VERSION) {
    return true;
  }
  for (const words of Object.values(archive.playerWords ?? {})) {
    if (!Array.isArray(words)) {
      return true;
    }
  }
  return false;
}

/** True when the local archive should be refreshed from RTDB maps. */
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
  if (isLegacyFinishedArchiveWords(archive)) {
    return false;
  }
  // Live maps still have words but archive lists are empty — refresh.
  const archiveEmpty = !archiveHasPlayerWords(archive.playerWords);
  const mapsClaimWords = Object.keys(session.wordPlayers ?? {}).length > 0;
  if (archiveEmpty && mapsClaimWords) {
    return true;
  }
  // Late append after an early finished archive: memory grew past disk.
  if (sessionWordPlayersRicherThanArchive(session.wordPlayers, archive.playerWords)) {
    return true;
  }
  return archivePlayerWordsDisagreeWithCounts(archive);
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
  await AsyncStorage.setItem(
    FINISHED_ARCHIVES_KEY,
    JSON.stringify(trimFinishedArchiveStore(store)),
  );
}

function trimFinishedStore(store: FinishedArchiveStore): FinishedArchiveStore {
  const entries = Object.entries(store).sort(([, a], [, b]) => b.savedAt - a.savedAt);
  if (entries.length <= MAX_FINISHED_ARCHIVES) {
    return store;
  }
  return Object.fromEntries(entries.slice(0, MAX_FINISHED_ARCHIVES));
}

function trimStoredLexiconSnapshots(store: FinishedArchiveStore): FinishedArchiveStore {
  const entries = Object.entries(store).sort(([, a], [, b]) => b.savedAt - a.savedAt);
  let lexiconSlots = 0;
  let changed = false;
  const next: FinishedArchiveStore = {};
  for (const [key, archive] of entries) {
    if (archive.playableLexicon) {
      if (lexiconSlots < MAX_STORED_LEXICON_SNAPSHOTS) {
        next[key] = archive;
        lexiconSlots += 1;
      } else {
        const entry: FinishedRoundArchive = { ...archive };
        delete entry.playableLexicon;
        next[key] = entry;
        changed = true;
      }
    } else {
      next[key] = archive;
    }
  }
  return changed ? next : store;
}

function trimFinishedArchiveStore(store: FinishedArchiveStore): FinishedArchiveStore {
  return trimStoredLexiconSnapshots(trimFinishedStore(store));
}

export function playingRoundSnapshotFromSession(session: GameSession): PlayingRoundSnapshot | null {
  if (session.status !== 'playing' || session.timerEndsAt == null) {
    return null;
  }
  return {
    baseWord: session.baseWord,
    settings: session.settings,
    players: session.players,
    wordPlayers: session.wordPlayers,
    pauseState: session.pauseState,
    timerEndsAt: session.timerEndsAt,
    roundStartedAt: session.roundStartedAt ?? undefined,
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
  const playableLexicon = playableLexiconSnapshotForSession(session);
  const stampedSession = sessionWithDerivedTotalsFromWords(session, words);
  const serializedWords = serializeAllPlayerWords(words);
  store[finishedArchiveKey(gameId, baseWordRound)] = {
    gameId: normalizeRoomCode(gameId),
    baseWordRound,
    savedAt: Date.now(),
    session: stampedSession,
    playerWords: serializedWords,
    archiveVersion: FINISHED_ARCHIVE_VERSION,
    ackSent: existing?.ackSent === true ? true : false,
    playerWordCounts: playerWordCountsFromWords(words),
    ...(playableLexicon ? { playableLexicon } : {}),
  };
  await writeFinishedStore(store);
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
