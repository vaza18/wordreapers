import {
  get,
  onDisconnect,
  onValue,
  ref,
  remove,
  runTransaction,
  update,
  type DatabaseReference,
  type Unsubscribe,
} from 'firebase/database';

import { isOrphanGameSessionShell, orphanShellHasPlayer } from '../online/orphan-game-session.js';
import type { PlayerProfile } from '../profile/player-profile.js';

import { currentBaseWordPickerUid } from '../online/base-word-picker.js';
import { clearAllActiveRoundCachesForGame } from '../online/active-round-cache.js';
import { setOrganizerWaitingRoom } from '../online/organizer-waiting-room.js';
import { resolveGameSessionSettings } from './session-settings.js';
import { recomputeSessionPlayerScores } from '../game/scoring.js';
import {
  resolveEarlyFinishVoteIfExpired,
  resolveResumeVoteIfExpired,
} from './session-votes-service.js';
import {
  clearAllPlayerWords,
  clearWaitingLobbyPlayerWordsAsOrganizer,
} from './player-words-service.js';
import { getServerNow } from './server-clock.js';
import { ensureAnonymousAuth, getFirebaseUid } from './auth.js';
import { isFirebasePermissionDenied } from './rtdb-errors.js';
import { withFinishedPurgeFields } from './session-purge.js';
import { getFirebaseDatabase } from './init.js';
import { gameSessionPath, GAME_SESSIONS_PATH } from './paths.js';
import { isValidRoomCode, normalizeRoomCode } from './room-code.js';
import type { GameSession, GameSessionPlayer, GameSessionSettings } from './types.js';

export { resolveGameSessionSettings } from './session-settings.js';

export type GameSessionSnapshot = GameSession & { id: string };

function sessionRef(gameId: string): DatabaseReference {
  return ref(getFirebaseDatabase(), gameSessionPath(gameId));
}

function playersRef(gameId: string): DatabaseReference {
  return ref(getFirebaseDatabase(), `${gameSessionPath(gameId)}/players`);
}

function playerRef(gameId: string, uid: string): DatabaseReference {
  return ref(getFirebaseDatabase(), `${gameSessionPath(gameId)}/players/${uid}`);
}

export interface JoinGameSessionOptions {
  invitedByUid?: string;
}

function profileToPlayer(
  profile: PlayerProfile,
  online = true,
  invitedByUid?: string,
): GameSessionPlayer {
  const player: GameSessionPlayer = {
    name: profile.name.trim(),
    avatarColorIndex: profile.avatarColorIndex,
    wordCount: 0,
    score: 0,
    online,
  };
  if (profile.gender === 'm' || profile.gender === 'f') {
    player.gender = profile.gender;
  }
  if (invitedByUid) {
    player.invitedBy = invitedByUid;
  }
  return player;
}

/** Cancel server-side onDisconnect hooks without forcing `online: false` (React remount-safe). */
export async function cancelPlayerOnlineOnDisconnect(gameId: string, uid: string): Promise<void> {
  await cancelPlayerOnDisconnect(normalizeRoomCode(gameId), uid);
}

async function cancelPlayerOnDisconnect(gameId: string, uid: string): Promise<void> {
  const node = playerRef(normalizeRoomCode(gameId), uid);
  try {
    await onDisconnect(node).cancel();
  } catch (error) {
    if (isFirebasePermissionDenied(error)) {
      return;
    }
    throw error;
  }
}

async function setPlayerOnlinePresence(gameId: string, uid: string): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  const node = playerRef(normalized, uid);
  try {
    await onDisconnect(node).cancel();
    await update(node, { online: true });
    await onDisconnect(node).update({ online: false });
  } catch (error) {
    if (isFirebasePermissionDenied(error)) {
      return;
    }
    throw error;
  }
}

/** Cancel local onDisconnect hooks and remove orphan shells before recreating a session root. */
export async function clearSessionRootForRecreate(gameId: string, uid: string): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  await cancelPlayerOnDisconnect(normalized, uid);
  await removeOrphanGameSessionShell(normalized, uid);
}

/**
 * Clear RTDB presence when leaving the results screen (unblocks coordinated cleanup).
 */
export async function markPlayerOffline(gameId: string, uid: string): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  const node = playerRef(normalized, uid);
  try {
    await cancelPlayerOnDisconnect(normalized, uid);
    const snapshot = await get(node);
    if (!snapshot.exists()) {
      return;
    }
    await update(node, { online: false });
  } catch (error) {
    if (isFirebasePermissionDenied(error)) {
      return;
    }
    throw error;
  }
}

export async function removeOrphanGameSessionShell(gameId: string, uid?: string): Promise<boolean> {
  const normalized = normalizeRoomCode(gameId);
  const snapshot = await get(sessionRef(normalized));
  if (!snapshot.exists()) {
    return false;
  }
  const session = snapshot.val();
  if (!isOrphanGameSessionShell(session)) {
    return false;
  }
  if (uid) {
    const players = (session as GameSession).players ?? {};
    if (!players[uid]) {
      return false;
    }
  }
  try {
    await remove(sessionRef(normalized));
    return true;
  } catch (error) {
    if (isFirebasePermissionDenied(error)) {
      return false;
    }
    throw error;
  }
}

function profilePatch(
  profile: PlayerProfile,
): Pick<GameSessionPlayer, 'name' | 'avatarColorIndex'> & { gender?: 'm' | 'f' | null } {
  const patch: Pick<GameSessionPlayer, 'name' | 'avatarColorIndex'> & {
    gender?: 'm' | 'f' | null;
  } = {
    name: profile.name.trim(),
    avatarColorIndex: profile.avatarColorIndex,
  };
  if (profile.gender === 'm' || profile.gender === 'f') {
    patch.gender = profile.gender;
  } else {
    patch.gender = null;
  }
  return patch;
}

async function readSessionSnapshot(gameId: string): Promise<GameSessionSnapshot> {
  const normalized = normalizeRoomCode(gameId);
  const snapshot = await get(sessionRef(normalized));
  if (!snapshot.exists()) {
    throw new Error('ROOM_NOT_FOUND');
  }
  return { id: normalized, ...(snapshot.val() as GameSession) };
}

/**
 * Rejoin a rostered player who left or went offline (clears `hasLeft`, restores presence).
 */
export async function rejoinExistingPlayer(
  gameId: string,
  uid: string,
  profile: PlayerProfile,
): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  const node = playerRef(normalized, uid);
  await update(node, {
    ...profilePatch(profile),
    online: true,
    hasLeft: null,
  });
  await setPlayerOnlinePresence(normalized, uid);
}

/**
 * Join or rejoin a room; returns the current session snapshot for routing.
 */
export async function joinGameSession(
  gameId: string,
  profile: PlayerProfile,
  options?: JoinGameSessionOptions,
): Promise<GameSessionSnapshot> {
  const user = await ensureAnonymousAuth();
  const normalized = normalizeRoomCode(gameId);
  if (!isValidRoomCode(normalized)) {
    throw new Error('INVALID_CODE');
  }

  const snapshot = await get(sessionRef(normalized));
  if (!snapshot.exists()) {
    throw new Error('ROOM_NOT_FOUND');
  }

  const session = snapshot.val() as GameSession;
  if (
    session.status !== 'waiting' &&
    session.status !== 'playing' &&
    session.status !== 'finished'
  ) {
    throw new Error('ROOM_NOT_JOINABLE');
  }

  if (session.players[user.uid]) {
    await rejoinExistingPlayer(normalized, user.uid, profile);
    const updated = await readSessionSnapshot(normalized);
    if (updated.status === 'waiting' && updated.organizerId === user.uid) {
      await clearWaitingLobbyPlayerWordsAsOrganizer(normalized, updated, user.uid);
    }
    return updated;
  }

  const inviterUid =
    options?.invitedByUid && session.players[options.invitedByUid]
      ? options.invitedByUid
      : undefined;

  const newPlayer = profileToPlayer(profile, true, inviterUid);

  await update(playersRef(normalized), {
    [user.uid]: newPlayer,
  });

  await runTransaction(sessionRef(normalized), (current) => {
    if (current == null) {
      return undefined;
    }
    const next = current as GameSession;
    let changed = false;

    if (!next.players[user.uid]) {
      next.players = { ...next.players, [user.uid]: newPlayer };
      changed = true;
    }

    const order = [...(next.baseWordPickerOrder ?? [next.organizerId])];
    if (!order.includes(user.uid)) {
      order.push(user.uid);
      next.baseWordPickerOrder = order;
      changed = true;
    }

    const playerCount = Object.keys(next.players).length;
    const resolvedSettings = resolveGameSessionSettings(next.settings, playerCount);
    if (
      next.settings.uniqueBonusMode !== resolvedSettings.uniqueBonusMode ||
      next.settings.uniqueBonusEnabled !== resolvedSettings.uniqueBonusEnabled
    ) {
      next.settings = resolvedSettings;
      changed = true;
    }

    const hasWords = Object.keys(next.wordPlayers ?? {}).length > 0;
    if (next.status === 'playing' && hasWords) {
      recomputeSessionPlayerScores(next, resolvedSettings.uniqueBonusEnabled);
      changed = true;
    }

    return changed ? next : undefined;
  });

  await setPlayerOnlinePresence(normalized, user.uid);
  return readSessionSnapshot(normalized);
}

/**
 * Rewrite session player totals from wordCounts / wordPlayers when they drift (e.g. solo → 3+).
 */
export async function syncSessionPlayerScores(gameId: string): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  try {
    await runTransaction(sessionRef(normalized), (current) => {
      if (current == null) {
        return undefined;
      }
      const session = current as GameSession;
      if (session.status !== 'playing' || Object.keys(session.wordPlayers ?? {}).length === 0) {
        return undefined;
      }

      const playerCount = Object.keys(session.players).length;
      const resolvedSettings = resolveGameSessionSettings(session.settings, playerCount);
      const players = Object.fromEntries(
        Object.entries(session.players).map(([playerId, player]) => [playerId, { ...player }]),
      );
      recomputeSessionPlayerScores(
        { players, wordCounts: session.wordCounts, wordPlayers: session.wordPlayers },
        resolvedSettings.uniqueBonusEnabled,
      );

      let changed =
        session.settings.uniqueBonusEnabled !== resolvedSettings.uniqueBonusEnabled ||
        session.settings.uniqueBonusMode !== resolvedSettings.uniqueBonusMode;
      if (!changed) {
        for (const [playerId, player] of Object.entries(players)) {
          const stored = session.players[playerId];
          if (stored?.score !== player.score || stored?.wordCount !== player.wordCount) {
            changed = true;
            break;
          }
        }
      }

      if (!changed) {
        return undefined;
      }

      return {
        ...session,
        settings: resolvedSettings,
        players,
      };
    });
  } catch (error) {
    if (__DEV__) {
      console.warn('syncSessionPlayerScores', error);
    }
  }
}

/**
 * Subscribe to session updates (lobby / play).
 */
export function subscribeGameSession(
  gameId: string,
  listener: (session: GameSessionSnapshot | null) => void,
): Unsubscribe {
  const normalized = normalizeRoomCode(gameId);
  return onValue(
    sessionRef(normalized),
    (snapshot) => {
      if (!snapshot.exists()) {
        listener(null);
        return;
      }
      const raw = snapshot.val();
      if (isOrphanGameSessionShell(raw)) {
        const uid = getFirebaseUid();
        if (uid && orphanShellHasPlayer(raw, uid)) {
          void removeOrphanGameSessionShell(normalized, uid);
        }
        listener(null);
        return;
      }
      const session = raw as GameSession;
      listener({ id: normalized, ...session });
    },
    (error) => {
      if (__DEV__) {
        console.warn('subscribeGameSession', error);
      }
      listener(null);
    },
  );
}

/**
 * Mark player online and register onDisconnect → offline.
 * Skips players who voluntarily left (`hasLeft`).
 */
export async function markPlayerOnline(gameId: string, uid: string): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  const node = playerRef(normalized, uid);
  try {
    const snapshot = await get(node);
    if (!snapshot.exists()) {
      return;
    }
    const player = snapshot.val() as GameSessionPlayer;
    if (player.hasLeft === true) {
      return;
    }
    await setPlayerOnlinePresence(normalized, uid);
  } catch (error) {
    if (isFirebasePermissionDenied(error)) {
      return;
    }
    throw error;
  }
}

/**
 * Re-mark online whenever RTDB reconnects (e.g. after phone lock / background).
 */
export function subscribePlayerOnlinePresence(gameId: string, uid: string): Unsubscribe {
  const connectedRef = ref(getFirebaseDatabase(), '.info/connected');
  return onValue(connectedRef, (snapshot) => {
    if (snapshot.val() === true) {
      void markPlayerOnline(gameId, uid);
    }
  });
}

/**
 * Organizer or current base-word picker updates round settings (and optionally base word).
 */
export async function updateGameSessionSetup(
  gameId: string,
  actorUid: string,
  payload: {
    baseWord?: string;
    settings: GameSessionSettings;
  },
): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  const snapshot = await get(sessionRef(normalized));
  if (!snapshot.exists()) {
    throw new Error('ROOM_NOT_FOUND');
  }
  const session = snapshot.val() as GameSession;
  const isOrganizer = session.organizerId === actorUid;
  const isPicker = currentBaseWordPickerUid(session) === actorUid;
  if (!isOrganizer && !isPicker) {
    throw new Error('NOT_AUTHORIZED');
  }
  if (session.status !== 'waiting') {
    throw new Error('ROOM_NOT_WAITING');
  }

  const updates: { settings: GameSessionSettings; baseWord?: string } = {
    settings: payload.settings,
  };
  if (payload.baseWord !== undefined) {
    if (!payload.baseWord || payload.baseWord.length < 2) {
      throw new Error('BASE_WORD_MISSING');
    }
    updates.baseWord = payload.baseWord;
  }

  await update(sessionRef(normalized), updates);
}

/**
 * Current picker sets base word in lobby (rotates by join order each rematch).
 */
export async function updateGameSessionBaseWord(
  gameId: string,
  uid: string,
  baseWord: string,
): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  const snapshot = await get(sessionRef(normalized));
  if (!snapshot.exists()) {
    throw new Error('ROOM_NOT_FOUND');
  }
  const session = snapshot.val() as GameSession;
  if (session.status !== 'waiting') {
    throw new Error('ROOM_NOT_WAITING');
  }
  if (currentBaseWordPickerUid(session) !== uid) {
    throw new Error('NOT_BASE_WORD_PICKER');
  }
  if (!baseWord || baseWord.length < 2) {
    throw new Error('BASE_WORD_MISSING');
  }

  await update(sessionRef(normalized), { baseWord });
}

/** Fix parking from uniqueBonusMode - updateGameSessionSetup receives uniqueBonusEnabled boolean already */

/**
 * Start the round: current base-word picker (or organizer) sets playing + server timer.
 */
export async function startGameSession(gameId: string, actorUid: string): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  const snapshot = await get(sessionRef(normalized));
  if (!snapshot.exists()) {
    throw new Error('ROOM_NOT_FOUND');
  }
  const session = snapshot.val() as GameSession;
  const pickerUid = currentBaseWordPickerUid(session);
  if (pickerUid !== actorUid) {
    throw new Error('NOT_ROUND_STARTER');
  }
  if (session.status !== 'waiting') {
    throw new Error('ROOM_NOT_WAITING');
  }
  if (!session.baseWord || session.baseWord.length < 2) {
    throw new Error('BASE_WORD_MISSING');
  }

  const settings = resolveGameSessionSettings(
    session.settings,
    Object.keys(session.players).length,
  );

  const endsAt = getServerNow() + settings.durationSeconds * 1000;
  const players: Record<string, GameSessionPlayer> = {};
  for (const [uid, player] of Object.entries(session.players)) {
    players[uid] = { ...player, score: 0, wordCount: 0 };
  }

  setOrganizerWaitingRoom(null);

  await clearAllActiveRoundCachesForGame(normalized);

  // Organizer clears all word nodes; picker best-effort (organizer rejoin also clears).
  await clearAllPlayerWords(
    normalized,
    Object.keys(session.players),
    actorUid,
    session.organizerId,
    { everyPlayer: true },
  );

  await update(sessionRef(normalized), {
    status: 'playing',
    timerEndsAt: endsAt,
    settings,
    players,
    wordCounts: {},
    wordFirst: {},
    wordPlayers: {},
    earlyFinishVote: null,
    pauseVote: null,
    resumeVote: null,
    pauseState: null,
  });
}

/**
 * Leave room — keep player in session for standings/results (TZ).
 */
export async function leaveGameSession(gameId: string, uid: string): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  const node = playerRef(normalized, uid);
  await onDisconnect(node).cancel();
  await update(node, { online: false, hasLeft: true });
  try {
    await resolveEarlyFinishVoteIfExpired(normalized);
    await resolveResumeVoteIfExpired(normalized);
  } catch (error) {
    if (__DEV__) {
      console.warn('leaveGameSession vote cleanup', error);
    }
  }
}

/**
 * List active room ids under root (debug).
 */
export async function gameSessionExists(gameId: string): Promise<boolean> {
  const normalized = normalizeRoomCode(gameId);
  const snapshot = await get(ref(getFirebaseDatabase(), `${GAME_SESSIONS_PATH}/${normalized}`));
  return snapshot.exists();
}

/**
 * End the round when server timer has elapsed (any connected client may commit).
 */
export async function finishGameSessionIfExpired(gameId: string): Promise<boolean> {
  const normalized = normalizeRoomCode(gameId);
  const preSnapshot = await get(sessionRef(normalized));
  if (!preSnapshot.exists()) {
    return false;
  }
  const preSession = preSnapshot.val() as GameSession;
  if (preSession.status !== 'playing' || preSession.timerEndsAt === null) {
    return false;
  }
  if (getServerNow() < preSession.timerEndsAt) {
    return false;
  }
  if (preSession.addTimeVote) {
    return false;
  }
  try {
    const result = await runTransaction(sessionRef(normalized), (current) => {
      if (current == null) {
        return undefined;
      }
      const session = current as GameSession;
      if (session.status !== 'playing' || session.timerEndsAt === null) {
        return undefined;
      }
      if (getServerNow() < session.timerEndsAt) {
        return undefined;
      }
      if (session.addTimeVote) {
        return undefined;
      }
      const playerCount = Object.keys(session.players).length;
      const resolvedSettings = resolveGameSessionSettings(session.settings, playerCount);
      if (Object.keys(session.wordPlayers ?? {}).length > 0) {
        recomputeSessionPlayerScores(session, resolvedSettings.uniqueBonusEnabled);
        session.settings = resolvedSettings;
      }
      const finishAt = session.timerEndsAt;
      return withFinishedPurgeFields(
        {
          ...session,
          status: 'finished',
          timerEndsAt: null,
          addTimeVote: null,
        },
        finishAt,
      );
    });
    return result.committed;
  } catch (error) {
    if (isFirebasePermissionDenied(error)) {
      return false;
    }
    throw error;
  }
}

/**
 * Force-finish round (organizer / dev).
 */
export async function finishGameSession(gameId: string): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  const finishedAt = getServerNow();
  await runTransaction(sessionRef(normalized), (current) => {
    if (current == null) {
      return undefined;
    }
    const session = current as GameSession;
    if (session.status !== 'playing') {
      return undefined;
    }
    const playerCount = Object.keys(session.players).length;
    const resolvedSettings = resolveGameSessionSettings(session.settings, playerCount);
    if (Object.keys(session.wordPlayers ?? {}).length > 0) {
      recomputeSessionPlayerScores(session, resolvedSettings.uniqueBonusEnabled);
      session.settings = resolvedSettings;
    }
    return withFinishedPurgeFields(
      {
        ...session,
        status: 'finished',
        timerEndsAt: null,
        finishedAt,
      },
      finishedAt,
    );
  });
  await clearAllActiveRoundCachesForGame(normalized);
}

/**
 * Return room to lobby for another round with the same roster (organizer only).
 */
export async function restartGameSessionForRematch(
  gameId: string,
  organizerUid: string,
): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  const preSnapshot = await get(sessionRef(normalized));
  if (!preSnapshot.exists()) {
    throw new Error('REMATCH_FAILED');
  }
  const preSession = preSnapshot.val() as GameSession;
  if (preSession.organizerId !== organizerUid || preSession.status !== 'finished') {
    throw new Error('REMATCH_FAILED');
  }
  await rematchFinishedSessionToWaiting(gameId, organizerUid);
}

/**
 * Transition a live `finished` session back to `waiting` for rematch.
 * Any rostered participant may commit (RTDB rules allow the update).
 */
export async function rematchFinishedSessionToWaiting(
  gameId: string,
  actorUid: string,
): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  const preSnapshot = await get(sessionRef(normalized));
  if (!preSnapshot.exists()) {
    throw new Error('REMATCH_FAILED');
  }
  const preSession = preSnapshot.val() as GameSession;
  if (preSession.status !== 'finished' || !preSession.players[actorUid]) {
    throw new Error('REMATCH_FAILED');
  }

  // During `finished`: organizer may delete all; guest only own nodes (RTDB rules).
  await clearAllPlayerWords(
    normalized,
    Object.keys(preSession.players),
    actorUid,
    preSession.organizerId,
    { everyPlayer: actorUid === preSession.organizerId },
  );

  const result = await runTransaction(sessionRef(normalized), (current) => {
    if (current == null) {
      return undefined;
    }
    const session = current as GameSession;
    if (session.status !== 'finished' || !session.players[actorUid]) {
      return undefined;
    }

    const players: Record<string, GameSessionPlayer> = {};
    for (const [uid, player] of Object.entries(session.players)) {
      players[uid] = { ...player, score: 0, wordCount: 0 };
    }

    return {
      ...session,
      status: 'waiting',
      settings: resolveGameSessionSettings(session.settings, Object.keys(session.players).length),
      timerEndsAt: null,
      baseWord: '',
      baseWordRound: (session.baseWordRound ?? 0) + 1,
      players,
      wordCounts: {},
      wordFirst: {},
      earlyFinishVote: null,
      pauseVote: null,
      pauseState: null,
      resumeVote: null,
      purgeAfterAt: null,
      finishedAt: null,
      resultsExitedBy: null,
    } satisfies GameSession;
  });

  if (!result.committed) {
    const again = await get(sessionRef(normalized));
    if (again.exists() && (again.val() as GameSession).status === 'waiting') {
      return;
    }
    throw new Error('REMATCH_FAILED');
  }
  await clearAllActiveRoundCachesForGame(normalized);
  if (actorUid === preSession.organizerId) {
    setOrganizerWaitingRoom(normalized);
  }
}

/**
 * Remove a waiting room the organizer no longer needs (back to home, new room, app background).
 * Uses read + remove (not a root transaction) so concurrent player online presence
 * updates do not abort the delete.
 */
export async function abandonWaitingGameSession(
  gameId: string,
  organizerUid: string,
): Promise<void> {
  const normalized = normalizeRoomCode(gameId);

  let preSnapshot;
  try {
    preSnapshot = await get(sessionRef(normalized));
  } catch (error) {
    if (isFirebasePermissionDenied(error)) {
      return;
    }
    throw error;
  }
  if (!preSnapshot.exists()) {
    return;
  }
  const session = preSnapshot.val() as GameSession;
  if (session.organizerId !== organizerUid || session.status !== 'waiting') {
    return;
  }
  const playerIds = Object.keys(session.players);
  await Promise.all(playerIds.map((playerUid) => cancelPlayerOnDisconnect(normalized, playerUid)));
  await clearAllPlayerWords(normalized, playerIds, organizerUid, organizerUid);
  try {
    await remove(sessionRef(normalized));
  } catch (error) {
    if (isFirebasePermissionDenied(error)) {
      return;
    }
    throw error;
  }
  await clearAllActiveRoundCachesForGame(normalized);
}
