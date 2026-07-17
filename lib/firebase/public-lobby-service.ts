import {
  endAt,
  get,
  limitToFirst,
  limitToLast,
  orderByChild,
  query,
  ref,
  remove,
  set,
  startAt,
  update,
  type DataSnapshot,
} from 'firebase/database';

import { normalizeUk } from '../dictionary/normalize.js';
import {
  PUBLIC_LOBBY_MAX_PLAYERS,
  PUBLIC_LOBBY_PAGE_SIZE,
  PUBLIC_LOBBY_TTL_MS,
} from '../online/public-lobby/constants.js';
import {
  canPublishPublicRoom,
  withPublicSafeSettings,
} from '../online/public-lobby/content-safety.js';
import { publicAliasAssignmentsForRoster } from '../online/public-lobby/public-alias.js';
import {
  sessionHadPublicBrowseExposure,
  sessionIdentityMasked,
} from '../online/public-lobby/session-identity.js';
import { ensureFirebaseAppCheck } from './app-check.js';
import { resolveGameSessionSettingsForSession } from './session-settings.js';
import { getServerNow } from './server-clock.js';
import { getFirebaseDatabase } from './init.js';
import {
  gameSessionPath,
  publicLobbyCountPath,
  publicLobbyEntryPath,
  publicLobbyLanguagePath,
} from './paths.js';
import { normalizeRoomCode } from './room-code.js';
import type { GameSession, GameSessionPlayer } from './types.js';
import type {
  PublicLobbyBrowseCursor,
  PublicLobbyBrowseSort,
  PublicLobbyIndexEntry,
  PublicLobbyRow,
} from './public-lobby-types.js';

function languageShardPath(language: string): string {
  return publicLobbyLanguagePath(language);
}

/** Players still in the waiting roster (not `hasLeft`). */
export function activePublicLobbyPlayerCount(players: Record<string, GameSessionPlayer>): number {
  return Object.values(players).filter((player) => player.hasLeft !== true).length;
}

function entryPath(language: string, gameId: string): string {
  return publicLobbyEntryPath(language, gameId);
}

function parseLobbyRows(snapshot: DataSnapshot, now: number): PublicLobbyRow[] {
  const rows: PublicLobbyRow[] = [];
  snapshot.forEach((child) => {
    const gameId = child.key;
    if (!gameId) {
      return;
    }
    const value = child.val() as PublicLobbyIndexEntry;
    if (typeof value.expiresAt === 'number' && value.expiresAt <= now) {
      return;
    }
    if (typeof value.playerCount === 'number' && value.playerCount <= 0) {
      return;
    }
    rows.push({ ...value, gameId });
  });
  return rows;
}

function cursorAfterPage(
  rows: PublicLobbyRow[],
  sort: PublicLobbyBrowseSort,
): PublicLobbyBrowseCursor | null {
  const last = rows[rows.length - 1];
  if (!last) {
    return null;
  }
  if (sort === 'newest') {
    return {
      sort,
      publishedAt: last.publishedAt,
      gameId: last.gameId,
    };
  }
  return {
    sort,
    baseWordNorm: last.baseWordNorm,
    gameId: last.gameId,
  };
}

async function fetchPageSlice(
  language: string,
  sort: PublicLobbyBrowseSort,
  pageSize: number,
  cursor: PublicLobbyBrowseCursor | null,
): Promise<PublicLobbyRow[]> {
  const db = getFirebaseDatabase();
  const baseRef = ref(db, languageShardPath(language));
  const now = getServerNow();

  if (sort === 'newest') {
    const q =
      cursor && cursor.publishedAt !== undefined
        ? query(
            baseRef,
            orderByChild('publishedAt'),
            endAt(cursor.publishedAt, cursor.gameId),
            limitToLast(pageSize + 1),
          )
        : query(baseRef, orderByChild('publishedAt'), limitToLast(pageSize));
    const snapshot = await get(q);
    let rows = parseLobbyRows(snapshot, now).reverse();
    if (cursor && rows.length > 0 && rows[0]?.gameId === cursor.gameId) {
      rows = rows.slice(1);
    }
    return rows.slice(0, pageSize);
  }

  const q =
    cursor && cursor.baseWordNorm !== undefined
      ? query(
          baseRef,
          orderByChild('baseWordNorm'),
          startAt(cursor.baseWordNorm, cursor.gameId),
          limitToFirst(pageSize + 1),
        )
      : query(baseRef, orderByChild('baseWordNorm'), limitToFirst(pageSize));
  const snapshot = await get(q);
  let rows = parseLobbyRows(snapshot, now);
  if (cursor && rows.length > 0 && rows[0]?.gameId === cursor.gameId) {
    rows = rows.slice(1);
  }
  return rows.slice(0, pageSize);
}

async function walkToPage(
  language: string,
  sort: PublicLobbyBrowseSort,
  targetPage: number,
  pageSize: number,
  knownCursors: Map<number, PublicLobbyBrowseCursor | null>,
): Promise<{ rows: PublicLobbyRow[]; cursors: Map<number, PublicLobbyBrowseCursor | null> }> {
  const cursors = new Map(knownCursors);
  cursors.set(0, null);

  let page = 1;
  let cursor: PublicLobbyBrowseCursor | null = null;
  let rows: PublicLobbyRow[] = [];

  while (page <= targetPage) {
    rows = await fetchPageSlice(language, sort, pageSize, cursor);
    const nextCursor = cursorAfterPage(rows, sort);
    cursors.set(page, nextCursor);
    if (page === targetPage) {
      break;
    }
    if (!nextCursor || rows.length < pageSize) {
      return { rows: [], cursors };
    }
    cursor = nextCursor;
    page += 1;
  }

  return { rows, cursors };
}

/** Count non-expired browse rows in the language shard (fallback when counter node is stale). */
async function fetchLivePublicLobbyTotal(language: string): Promise<number> {
  const snapshot = await get(ref(getFirebaseDatabase(), languageShardPath(language)));
  if (!snapshot.exists()) {
    return 0;
  }
  return parseLobbyRows(snapshot, getServerNow()).length;
}

/** Resolve browse total from counter node, falling back to a live shard scan. */
async function resolvePublicLobbyTotal(language: string): Promise<number> {
  const counter = await fetchPublicLobbyCount(language);
  if (counter !== null) {
    return counter;
  }
  return fetchLivePublicLobbyTotal(language);
}

/**
 * Fetch one browse page (non-realtime).
 * Hard-fails if App Check is not ready (unlike presence / session subscribe, which soft-fail
 * and still attach listeners). Browse is a one-shot read; the UI shows browseLoadFailed.
 */
export async function fetchPublicLobbyPage(
  language: string,
  sort: PublicLobbyBrowseSort,
  page: number,
  knownCursors: Map<number, PublicLobbyBrowseCursor | null> = new Map(),
  pageSize = PUBLIC_LOBBY_PAGE_SIZE,
): Promise<{
  rows: PublicLobbyRow[];
  page: number;
  total: number | null;
  totalPages: number | null;
  cursors: Map<number, PublicLobbyBrowseCursor | null>;
}> {
  await ensureFirebaseAppCheck();
  const safePage = Math.max(1, page);
  const total = await resolvePublicLobbyTotal(language);
  const totalPages = total === null ? null : total === 0 ? 0 : Math.ceil(total / pageSize);

  if (totalPages !== null && safePage > totalPages && totalPages > 0) {
    const walked = await walkToPage(language, sort, totalPages, pageSize, knownCursors);
    return {
      rows: walked.rows,
      page: totalPages,
      total,
      totalPages,
      cursors: walked.cursors,
    };
  }

  const walked = await walkToPage(language, sort, safePage, pageSize, knownCursors);
  return {
    rows: walked.rows,
    page: safePage,
    total,
    totalPages,
    cursors: walked.cursors,
  };
}

/** Read approximate active public lobby count for language shard. */
export async function fetchPublicLobbyCount(language: string): Promise<number | null> {
  await ensureFirebaseAppCheck();
  const snapshot = await get(ref(getFirebaseDatabase(), publicLobbyCountPath(language)));
  if (!snapshot.exists()) {
    return 0;
  }
  const value = snapshot.val();
  return typeof value === 'number' && value >= 0 ? value : null;
}

function buildIndexEntry(session: GameSession, now: number): PublicLobbyIndexEntry {
  const playerCount = activePublicLobbyPlayerCount(session.players);
  const baseWordNorm = normalizeUk(session.baseWord);
  return {
    baseWord: session.baseWord,
    baseWordNorm,
    playerCount,
    maxPlayers: session.maxPlayers ?? PUBLIC_LOBBY_MAX_PLAYERS,
    publishedAt: session.publicPublishedAt ?? now,
    expiresAt: (session.publicPublishedAt ?? now) + PUBLIC_LOBBY_TTL_MS,
  };
}

function publicAliasPatches(
  session: Pick<GameSession, 'organizerId' | 'players' | 'baseWordPickerOrder' | 'settings'>,
): Record<string, string> {
  const assignments = publicAliasAssignmentsForRoster(session, session.settings.language);
  const patches: Record<string, string> = {};
  for (const [uid, alias] of Object.entries(assignments)) {
    patches[`players/${uid}/publicAlias`] = alias;
  }
  return patches;
}

/** Reconcile «Гравець 1»…n after publish or join in a public lobby. */
export async function syncPublicRosterAliases(
  gameId: string,
  session: Pick<
    GameSession,
    'isPublic' | 'identityMasked' | 'organizerId' | 'players' | 'baseWordPickerOrder' | 'settings'
  >,
): Promise<void> {
  if (!session.isPublic && !sessionIdentityMasked(session)) {
    return;
  }
  const patches = publicAliasPatches(session);
  if (Object.keys(patches).length === 0) {
    return;
  }
  await update(ref(getFirebaseDatabase(), gameSessionPath(normalizeRoomCode(gameId))), patches);
}

export async function setRoomPublic(
  gameId: string,
  organizerUid: string,
  baseWords: readonly string[],
): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  const sessionSnap = await get(ref(getFirebaseDatabase(), gameSessionPath(normalized)));
  if (!sessionSnap.exists()) {
    throw new Error('ROOM_NOT_FOUND');
  }
  const session = sessionSnap.val() as GameSession;
  if (session.organizerId !== organizerUid || session.status !== 'waiting') {
    throw new Error('NOT_ORGANIZER');
  }

  const gate = canPublishPublicRoom(session, baseWords);
  if (!gate.ok) {
    throw new Error(gate.reason);
  }

  const now = getServerNow();
  const settings = withPublicSafeSettings(resolveGameSessionSettingsForSession(session));
  const language = settings.language;
  const rosterForAliases = { ...session, settings };

  await update(ref(getFirebaseDatabase(), gameSessionPath(normalized)), {
    isPublic: true,
    publicPublishedAt: now,
    maxPlayers: PUBLIC_LOBBY_MAX_PLAYERS,
    settings,
    ...publicAliasPatches(rosterForAliases),
  });

  const indexEntry = buildIndexEntry(
    {
      ...session,
      settings,
      publicPublishedAt: now,
      maxPlayers: PUBLIC_LOBBY_MAX_PLAYERS,
    },
    now,
  );

  await set(ref(getFirebaseDatabase(), entryPath(language, normalized)), indexEntry);
}

/**
 * Remove room from public index (private again).
 */
export async function setRoomPrivate(gameId: string, organizerUid: string): Promise<void> {
  await unpublishPublicLobby(gameId, organizerUid, { clearSessionFlag: true });
}

/** Drop browse index row and optionally clear session public flag. */
export async function unpublishPublicLobby(
  gameId: string,
  actorUid: string | null,
  options?: { clearSessionFlag?: boolean; force?: boolean },
): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  const sessionRef = ref(getFirebaseDatabase(), gameSessionPath(normalized));
  const sessionSnap = await get(sessionRef);
  if (!sessionSnap.exists()) {
    return;
  }
  const session = sessionSnap.val() as GameSession;
  if (
    !options?.force &&
    actorUid &&
    session.organizerId !== actorUid &&
    !session.players[actorUid]
  ) {
    throw new Error('NOT_ORGANIZER');
  }

  const language = session.settings?.language ?? 'uk-uk';
  const wasPublic = session.isPublic === true;

  if (options?.clearSessionFlag) {
    const updates: Record<string, unknown> = {
      isPublic: false,
      publicPublishedAt: null,
    };
    if (!sessionHadPublicBrowseExposure(session)) {
      for (const uid of Object.keys(session.players)) {
        updates[`players/${uid}/publicAlias`] = null;
      }
    }
    await update(sessionRef, updates);
  }

  if (wasPublic) {
    try {
      await remove(ref(getFirebaseDatabase(), entryPath(language, normalized)));
    } catch {
      // Session is already private; stale index row is cleaned by scheduled purge.
    }
  }
}

/** Keep browse playerCount in sync with active roster size. */
export async function syncPublicLobbyPlayerCount(
  gameId: string,
  session: Pick<GameSession, 'isPublic' | 'settings' | 'players'>,
): Promise<void> {
  if (!session.isPublic) {
    return;
  }
  const normalized = normalizeRoomCode(gameId);
  const language = session.settings.language;
  const playerCount = activePublicLobbyPlayerCount(session.players);
  if (playerCount <= 0) {
    await unpublishPublicLobby(normalized, null, { force: true });
    return;
  }
  try {
    await update(ref(getFirebaseDatabase(), entryPath(language, normalized)), {
      playerCount,
    });
  } catch {
    // Joiner may lack index write in older rules; lobby still works.
  }
}

/** Unpublish or refresh browse index after roster changes in a waiting public room. */
export async function reconcilePublicLobbyAfterRosterChange(
  gameId: string,
  session: GameSession,
): Promise<void> {
  if (!session.isPublic || session.status !== 'waiting') {
    return;
  }
  await syncPublicLobbyPlayerCount(gameId, session);
}
