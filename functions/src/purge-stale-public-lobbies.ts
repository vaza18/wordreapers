import * as admin from 'firebase-admin';

/** Must match client `PUBLIC_LOBBY_TTL_MS`. */
export const PUBLIC_LOBBY_TTL_MS = 5 * 60 * 1000;

interface PublicLobbyEntry {
  expiresAt?: number;
  playerCount?: number;
}

interface GameSessionPlayer {
  hasLeft?: boolean;
}

interface GameSession {
  status?: string;
  isPublic?: boolean;
  players?: Record<string, GameSessionPlayer>;
}

/** Count roster members who have not left the waiting room. */
function activePlayerCount(players: Record<string, GameSessionPlayer> | undefined): number {
  if (!players) {
    return 0;
  }
  return Object.values(players).filter((player) => player.hasLeft !== true).length;
}

/** Whether a browse index row should be removed. */
function shouldPurgeIndexRow(
  entry: PublicLobbyEntry,
  session: GameSession | null,
  now: number,
): boolean {
  if (typeof entry.expiresAt === 'number' && entry.expiresAt <= now) {
    return true;
  }
  if (!session) {
    return true;
  }
  if (session.status !== 'waiting' || session.isPublic !== true) {
    return true;
  }
  if (activePlayerCount(session.players) <= 0) {
    return true;
  }
  if (typeof entry.playerCount === 'number' && entry.playerCount <= 0) {
    return true;
  }
  return false;
}

/** Count non-expired browse rows with active playerCount in a language shard snapshot. */
export function countLivePublicLobbyRows(
  languageNode: admin.database.DataSnapshot,
  now: number,
): number {
  let live = 0;
  languageNode.forEach((gameNode) => {
    const entry = gameNode.val() as PublicLobbyEntry;
    if (typeof entry.expiresAt === 'number' && entry.expiresAt <= now) {
      return;
    }
    if (typeof entry.playerCount === 'number' && entry.playerCount <= 0) {
      return;
    }
    live += 1;
  });
  return live;
}

export interface PurgePublicLobbiesResult {
  scanned: number;
  purged: number;
}

/**
 * Remove stale public lobby index rows; reconcile counts per language shard.
 */
export async function purgeStalePublicLobbies(now = Date.now()): Promise<PurgePublicLobbiesResult> {
  const db = admin.database();
  const rootSnap = await db.ref('public_lobbies').once('value');
  if (!rootSnap.exists()) {
    return { scanned: 0, purged: 0 };
  }

  let scanned = 0;
  let purged = 0;
  const removals: Array<{ language: string; gameId: string }> = [];

  const languageNodes: Array<{ language: string; node: admin.database.DataSnapshot }> = [];
  rootSnap.forEach((languageNode) => {
    const language = languageNode.key;
    if (language) {
      languageNodes.push({ language, node: languageNode });
    }
  });

  for (const { language, node: languageNode } of languageNodes) {
    const gameNodes: Array<{ gameId: string; entry: PublicLobbyEntry }> = [];
    languageNode.forEach((gameNode) => {
      const gameId = gameNode.key;
      if (gameId) {
        gameNodes.push({ gameId, entry: gameNode.val() as PublicLobbyEntry });
      }
    });

    for (const { gameId, entry } of gameNodes) {
      scanned += 1;
      const sessionSnap = await db.ref(`game_sessions/${gameId}`).once('value');
      const session = sessionSnap.exists() ? (sessionSnap.val() as GameSession) : null;
      if (!shouldPurgeIndexRow(entry, session, now)) {
        continue;
      }
      purged += 1;
      removals.push({ language, gameId });
    }
  }

  await Promise.all(
    removals.map(({ language, gameId }) => db.ref(`public_lobbies/${language}/${gameId}`).remove()),
  );

  for (const { language } of languageNodes) {
    const shardSnap = await db.ref(`public_lobbies/${language}`).once('value');
    const live =
      shardSnap.exists() && shardSnap.key === language
        ? countLivePublicLobbyRows(shardSnap, now)
        : 0;
    await db.ref(`public_lobby_counts/${language}`).set(live);
  }

  return { scanned, purged };
}
