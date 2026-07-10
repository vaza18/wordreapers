import {
  get,
  onDisconnect,
  onValue,
  ref,
  remove,
  update,
  type DatabaseReference,
  type Unsubscribe,
} from 'firebase/database';
import { AppState } from 'react-native';

import { runRtdbTransaction } from './rtdb-transaction.js';
import { shouldMarkPresenceOnline } from '../online/presence/app-presence-state.js';
import {
  beginPresenceWrite,
  isPresenceWriteCurrent,
} from '../online/presence/presence-write-queue.js';

import { isOrphanGameSessionShell, orphanShellHasPlayer } from '../online/orphan-game-session.js';
import type { PlayerProfile } from '../profile/player-profile.js';

import { currentBaseWordPickerUid } from '../online/base-word-picker.js';
import { clearAllActiveRoundCachesForGame } from '../online/session/active-round-cache.js';
import { setOrganizerWaitingRoom } from '../online/organizer-waiting-room.js';
import {
  buildRoundStartWritePaths,
  resolveRoundStartSettings,
} from '../online/start-game-session-write.js';
import {
  resolveGameSessionSettings,
  resolveGameSessionSettingsForSession,
  uniqueBonusEnabledForActiveRound,
  uniqueBonusLatchSettingsPatch,
} from './session-settings.js';
import { recomputeSessionPlayerScores } from '../game/scoring.js';
import { appendLiveRoundPlayerUid } from './live-round-player-uids.js';
import { rematchWaitingPlayerPatch } from '../online/presence/live-round-membership.js';
import { shouldOrganizerAbandonWaitingRoom } from '../online/should-organizer-abandon-waiting-room.js';
import { computeRoundPlayedSecondsAtFinish } from '../game/round-duration.js';
import { reconcileOpenSessionVotes } from './session-votes-service.js';
import {
  clearAllPlayerWords,
  clearWaitingLobbyPlayerWordsAsOrganizer,
} from './player-words-service.js';
import { getServerNow } from './server-clock.js';
import { PUBLIC_LOBBY_MAX_PLAYERS } from '../online/public-lobby/constants.js';
import {
  applyPublicContentSafety,
  validateSessionBaseWord,
} from '../online/public-lobby/content-safety.js';
import { collectPublicAliases, nextPublicAlias } from '../online/public-lobby/public-alias.js';
import { sessionIdentityMasked } from '../online/public-lobby/session-identity.js';
import {
  activePublicLobbyPlayerCount,
  reconcilePublicLobbyAfterRosterChange,
  syncPublicLobbyPlayerCount,
  syncPublicRosterAliases,
  unpublishPublicLobby,
} from './public-lobby-service.js';
import { ensureAnonymousAuth, getFirebaseUid } from './auth.js';
import { isFirebaseIgnorableRtdbError, isFirebasePermissionDenied } from './rtdb-errors.js';
import { withFinishedPurgeFields } from './session-purge.js';
import { stripWordMapsFromSession } from './session-word-maps.js';
import type { SessionWordMaps } from './session-word-maps.js';
import { clearSessionWordMaps, fetchSessionWordMaps } from './session-word-maps-service.js';
import { getFirebaseDatabase } from './init.js';
import { gameSessionPath, GAME_SESSIONS_PATH } from './paths.js';
import { sessionRef } from './session-ref.js';
import { isValidRoomCode, normalizeRoomCode } from './room-code.js';
import type { GameSession, GameSessionPlayer, GameSessionSettings } from './types.js';
import type { BaseWord } from '../dictionary/dictionary-index.js';

let cachedBaseWordsForValidation: BaseWord[] | null = null;

async function loadBaseWordsForValidation(): Promise<readonly string[]> {
  if (cachedBaseWordsForValidation) {
    return cachedBaseWordsForValidation;
  }
  const { loadBundledBaseWords } = await import('../../services/dictionary-service.js');
  cachedBaseWordsForValidation = await loadBundledBaseWords();
  return cachedBaseWordsForValidation;
}

async function assertSessionBaseWordAllowed(baseWord: string, session: GameSession): Promise<void> {
  const baseWords = await loadBaseWordsForValidation();
  const result = validateSessionBaseWord(baseWord, baseWords, session);
  if (!result.ok) {
    throw new Error(result.reason);
  }
}

export { resolveGameSessionSettings } from './session-settings.js';

export type GameSessionSnapshot = GameSession & { id: string };

function playersRef(gameId: string): DatabaseReference {
  return ref(getFirebaseDatabase(), `${gameSessionPath(gameId)}/players`);
}

function playerRef(gameId: string, uid: string): DatabaseReference {
  return ref(getFirebaseDatabase(), `${gameSessionPath(gameId)}/players/${uid}`);
}

export interface JoinGameSessionOptions {
  invitedByUid?: string;
  /** How the player reached the room (browse enforces language match). */
  joinSource?: 'code' | 'browse';
  /** Player's game language when joining from browse. */
  playerLanguage?: string;
}

function profileToPlayer(
  profile: PlayerProfile,
  online = true,
  invitedByUid?: string,
  options?: { shareGender?: boolean },
): GameSessionPlayer {
  const player: GameSessionPlayer = {
    name: profile.name.trim(),
    avatarColorIndex: profile.avatarColorIndex,
    wordCount: 0,
    score: 0,
    online,
  };
  if (options?.shareGender !== false && (profile.gender === 'm' || profile.gender === 'f')) {
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

const voluntaryLeaveInFlight = new Map<string, number>();

function voluntaryLeaveKey(gameId: string, uid: string): string {
  return `${normalizeRoomCode(gameId)}:${uid}`;
}

/** Blocks mark-online races while a player is voluntarily leaving the waiting lobby. */
export function beginVoluntaryLeave(gameId: string, uid: string): void {
  const key = voluntaryLeaveKey(gameId, uid);
  voluntaryLeaveInFlight.set(key, (voluntaryLeaveInFlight.get(key) ?? 0) + 1);
}

export function endVoluntaryLeave(gameId: string, uid: string): void {
  const key = voluntaryLeaveKey(gameId, uid);
  const count = voluntaryLeaveInFlight.get(key) ?? 0;
  if (count <= 1) {
    voluntaryLeaveInFlight.delete(key);
    return;
  }
  voluntaryLeaveInFlight.set(key, count - 1);
}

function isVoluntaryLeaveInFlight(gameId: string, uid: string): boolean {
  return (voluntaryLeaveInFlight.get(voluntaryLeaveKey(gameId, uid)) ?? 0) > 0;
}

async function setPlayerOnlinePresence(gameId: string, uid: string): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  if (isVoluntaryLeaveInFlight(normalized, uid)) {
    return;
  }
  if (!shouldMarkPresenceOnline(AppState.currentState)) {
    return;
  }
  const generation = beginPresenceWrite(normalized, uid, 'online');
  const node = playerRef(normalized, uid);
  try {
    await onDisconnect(node).cancel();
    if (!isPresenceWriteCurrent(normalized, uid, generation, 'online')) {
      return;
    }
    if (
      isVoluntaryLeaveInFlight(normalized, uid) ||
      !shouldMarkPresenceOnline(AppState.currentState)
    ) {
      return;
    }
    await update(node, { online: true });
    if (!isPresenceWriteCurrent(normalized, uid, generation, 'online')) {
      return;
    }
    await onDisconnect(node).update({ online: false });
    await reconcileLobbyPickerState(normalized);
  } catch (error) {
    if (isFirebasePermissionDenied(error)) {
      return;
    }
    throw error;
  }
}

/** Keep lobby picker uid and base word aligned with who is online in waiting. */
export async function syncLobbyPickerState(gameId: string): Promise<void> {
  await reconcileLobbyPickerState(gameId);
}

async function reconcileLobbyPickerState(gameId: string): Promise<void> {
  const snapshot = await get(sessionRef(gameId));
  if (!snapshot.exists()) {
    return;
  }
  const session = snapshot.val() as GameSession;
  if (session.status !== 'waiting') {
    return;
  }

  const pickerUid = currentBaseWordPickerUid(session);
  const updates: Record<string, string | null> = {};

  if (session.baseWordPickerUid !== pickerUid) {
    updates.baseWordPickerUid = pickerUid;
  }

  if (
    session.baseWord &&
    session.baseWord.length >= 2 &&
    session.baseWordChosenBy &&
    session.baseWordChosenBy !== pickerUid
  ) {
    updates.baseWord = '';
    updates.baseWordChosenBy = null;
  }

  if (Object.keys(updates).length === 0) {
    return;
  }

  try {
    await update(sessionRef(gameId), updates);
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
 * Clear RTDB presence (background, results view, exit). Does not set `hasLeft`.
 * Reconciles open in-round votes so peers are not left waiting on an offline voter.
 */
export async function markPlayerOffline(gameId: string, uid: string): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  const generation = beginPresenceWrite(normalized, uid, 'offline');
  const node = playerRef(normalized, uid);
  try {
    await cancelPlayerOnDisconnect(normalized, uid);
    if (!isPresenceWriteCurrent(normalized, uid, generation, 'offline')) {
      return;
    }
    const snapshot = await get(node);
    if (!snapshot.exists()) {
      return;
    }
    if (!isPresenceWriteCurrent(normalized, uid, generation, 'offline')) {
      return;
    }
    await update(node, { online: false });
    try {
      await reconcileOpenSessionVotes(normalized);
    } catch (error) {
      if (__DEV__) {
        console.warn('markPlayerOffline vote reconcile', error);
      }
    }
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

/** Fresh RTDB session read for routing after rematch / rejoin. */
export async function readGameSessionSnapshot(gameId: string): Promise<GameSessionSnapshot> {
  return readSessionSnapshot(gameId);
}

/** Like `readGameSessionSnapshot`, but returns null when the room root is absent. */
export async function tryReadGameSessionSnapshot(
  gameId: string,
): Promise<GameSessionSnapshot | null> {
  try {
    return await readSessionSnapshot(gameId);
  } catch (error) {
    if (error instanceof Error && error.message === 'ROOM_NOT_FOUND') {
      return null;
    }
    if (isFirebasePermissionDenied(error)) {
      return null;
    }
    throw error;
  }
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
    hasLeft: false,
  });
  await setPlayerOnlinePresence(normalized, uid);
  const sessionSnapshot = await get(sessionRef(normalized));
  if (sessionSnapshot.exists()) {
    const session = sessionSnapshot.val() as GameSession;
    if (session.status === 'playing') {
      const liveUids: string[] | null | undefined = session.liveRoundPlayerUids;
      await update(sessionRef(normalized), {
        liveRoundPlayerUids: appendLiveRoundPlayerUid(liveUids, uid),
      });
    }
  }
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

  const isBrowseJoin = options?.joinSource === 'browse';
  let session: GameSession | null = null;

  try {
    const snapshot = await get(sessionRef(normalized));
    if (!snapshot.exists()) {
      throw new Error('ROOM_NOT_FOUND');
    }
    session = snapshot.val() as GameSession;
  } catch (error) {
    if (error instanceof Error && error.message === 'ROOM_NOT_FOUND') {
      throw error;
    }
    if (isBrowseJoin || !isFirebasePermissionDenied(error)) {
      throw error;
    }
    return blindJoinGameSession(normalized, profile, user.uid, options);
  }

  return joinGameSessionWithSnapshot(normalized, profile, user.uid, session, options);
}

async function blindJoinGameSession(
  gameId: string,
  profile: PlayerProfile,
  uid: string,
  options?: JoinGameSessionOptions,
): Promise<GameSessionSnapshot> {
  const newPlayer = profileToPlayer(profile, true, options?.invitedByUid, { shareGender: true });
  newPlayer.joinedVia = 'invite';

  try {
    await update(playersRef(gameId), { [uid]: newPlayer });
  } catch (error) {
    if (isFirebasePermissionDenied(error)) {
      throw new Error('ROOM_NOT_FOUND');
    }
    throw error;
  }

  const committed = await commitNewPlayerJoinTransaction(gameId, uid, newPlayer, {
    isBrowseJoin: false,
    wordMaps: await fetchSessionWordMaps(gameId),
  });

  if (committed === 'ROOM_NOT_FOUND') {
    const rollback = await rollbackJoinPlayerIfSessionMissing(gameId, uid);
    if (rollback === 'ROOM_NOT_FOUND') {
      throw new Error('ROOM_NOT_FOUND');
    }
  }
  if (committed === 'ROOM_FULL') {
    try {
      await remove(playerRef(gameId, uid));
    } catch {
      // Best-effort rollback.
    }
    throw new Error('ROOM_FULL');
  }

  await setPlayerOnlinePresence(gameId, uid);
  const joined = await readSessionSnapshot(gameId);
  if (sessionIdentityMasked(joined)) {
    await syncPublicRosterAliases(gameId, joined);
    return readSessionSnapshot(gameId);
  }
  if (joined.isPublic) {
    await syncPublicLobbyPlayerCount(gameId, joined);
  }
  return joined;
}

type JoinCommitResult = 'ok' | 'ROOM_FULL' | 'ROOM_NOT_FOUND';

/** Patch session metadata after `players/{uid}` is written (avoids root tx vs roster races). */
function buildJoinCommitPatch(
  session: GameSession,
  uid: string,
  newPlayer: GameSessionPlayer,
  context: { isBrowseJoin: boolean; wordMaps: SessionWordMaps },
): { patch: Record<string, unknown>; roomFull: boolean } {
  const next: GameSession = {
    ...session,
    players: session.players[uid] ? session.players : { ...session.players, [uid]: newPlayer },
  };

  if (next.isPublic) {
    const activeCount = activePublicLobbyPlayerCount(next.players);
    const maxPlayers = next.maxPlayers ?? PUBLIC_LOBBY_MAX_PLAYERS;
    if (activeCount > maxPlayers) {
      return { patch: {}, roomFull: true };
    }
  }

  const patch: Record<string, unknown> = {};
  const order = [...(next.baseWordPickerOrder ?? [next.organizerId])];
  if (!order.includes(uid)) {
    order.push(uid);
    patch.baseWordPickerOrder = order;
  }

  if (context.isBrowseJoin && !next.identityMasked) {
    patch.identityMasked = true;
  }

  const playerCount = Object.keys(next.players).length;
  const resolvedSettings = applyPublicContentSafety(
    resolveGameSessionSettings(next.settings, playerCount),
    next,
  );
  // Mid-round joins must not change settings — RTDB rules reject settings writes while playing.
  if (next.status !== 'playing') {
    if (
      next.settings.uniqueBonusMode !== resolvedSettings.uniqueBonusMode ||
      next.settings.uniqueBonusEnabled !== resolvedSettings.uniqueBonusEnabled ||
      next.settings.allowProperNouns !== resolvedSettings.allowProperNouns ||
      next.settings.allowSlang !== resolvedSettings.allowSlang
    ) {
      patch.settings = resolvedSettings;
    }
  }

  if (next.status === 'playing') {
    // Round 2+ requires liveRoundPlayerUids; round 1 treats all roster members as opted in.
    const liveUids = appendLiveRoundPlayerUid(next.liveRoundPlayerUids, uid);
    const sessionWithLiveUid: GameSession = { ...next, liveRoundPlayerUids: liveUids };
    const latchSettings = uniqueBonusLatchSettingsPatch(sessionWithLiveUid);
    const sessionAfterJoin = latchSettings
      ? { ...sessionWithLiveUid, settings: latchSettings }
      : sessionWithLiveUid;
    if (latchSettings) {
      patch.settings = latchSettings;
    }
    patch.liveRoundPlayerUids = liveUids;

    const hasWords = Object.keys(context.wordMaps.wordPlayers ?? {}).length > 0;
    const bonusEnabled = uniqueBonusEnabledForActiveRound(sessionAfterJoin);
    if (hasWords && bonusEnabled) {
      recomputeSessionPlayerScores(
        { ...sessionAfterJoin, wordPlayers: context.wordMaps.wordPlayers },
        bonusEnabled,
      );
      patch.players = sessionAfterJoin.players;
    }
  }

  return { patch, roomFull: false };
}

async function commitNewPlayerJoinTransaction(
  gameId: string,
  uid: string,
  newPlayer: GameSessionPlayer,
  context: { isBrowseJoin: boolean; wordMaps: SessionWordMaps },
): Promise<JoinCommitResult> {
  const normalized = normalizeRoomCode(gameId);
  const snapshot = await get(sessionRef(normalized));
  if (!snapshot.exists()) {
    return 'ROOM_NOT_FOUND';
  }

  const built = buildJoinCommitPatch(snapshot.val() as GameSession, uid, newPlayer, context);
  if (built.roomFull) {
    return 'ROOM_FULL';
  }
  if (Object.keys(built.patch).length === 0) {
    return 'ok';
  }

  try {
    await update(sessionRef(normalized), built.patch);
  } catch (error) {
    // Roster write already succeeded; metadata patch must not block join/rejoin.
    if (isFirebasePermissionDenied(error)) {
      return 'ok';
    }
    throw error;
  }
  return 'ok';
}

async function rollbackJoinPlayerIfSessionMissing(
  gameId: string,
  uid: string,
): Promise<'ROOM_NOT_FOUND' | 'partial_ok'> {
  const normalized = normalizeRoomCode(gameId);
  const snapshot = await get(sessionRef(normalized));
  if (!snapshot.exists()) {
    try {
      await remove(playerRef(normalized, uid));
    } catch {
      // Best-effort rollback.
    }
    return 'ROOM_NOT_FOUND';
  }
  const session = snapshot.val() as GameSession;
  if (session.players[uid]) {
    return 'partial_ok';
  }
  return 'ROOM_NOT_FOUND';
}

async function joinGameSessionWithSnapshot(
  gameId: string,
  profile: PlayerProfile,
  uid: string,
  session: GameSession,
  options?: JoinGameSessionOptions,
): Promise<GameSessionSnapshot> {
  if (
    session.status !== 'waiting' &&
    session.status !== 'playing' &&
    session.status !== 'finished'
  ) {
    throw new Error('ROOM_NOT_JOINABLE');
  }

  if (session.players[uid]) {
    await rejoinExistingPlayer(gameId, uid, profile);
    const updated = await readSessionSnapshot(gameId);
    if (updated.status === 'waiting' && updated.organizerId === uid) {
      await clearWaitingLobbyPlayerWordsAsOrganizer(gameId, updated, uid);
    }
    return updated;
  }

  const inviterUid =
    options?.invitedByUid && session.players[options.invitedByUid]
      ? options.invitedByUid
      : undefined;

  if (session.isPublic) {
    const activeCount = activePublicLobbyPlayerCount(session.players);
    const maxPlayers = session.maxPlayers ?? PUBLIC_LOBBY_MAX_PLAYERS;
    if (activeCount >= maxPlayers) {
      throw new Error('ROOM_FULL');
    }
    if (
      options?.joinSource === 'browse' &&
      options.playerLanguage &&
      session.settings.language !== options.playerLanguage
    ) {
      throw new Error('LANGUAGE_MISMATCH');
    }
  }

  const isBrowseJoin = options?.joinSource === 'browse';
  const maskedAlready = sessionIdentityMasked(session);
  const locale = session.settings.language;

  const newPlayer = profileToPlayer(profile, true, inviterUid, {
    shareGender: !maskedAlready && !isBrowseJoin,
  });
  newPlayer.joinedVia = isBrowseJoin ? 'browse' : 'invite';
  if (maskedAlready || isBrowseJoin || session.isPublic) {
    newPlayer.publicAlias = nextPublicAlias(collectPublicAliases(session.players), locale);
  }

  await update(playersRef(gameId), {
    [uid]: newPlayer,
  });

  const committed = await commitNewPlayerJoinTransaction(gameId, uid, newPlayer, {
    isBrowseJoin,
    wordMaps: await fetchSessionWordMaps(gameId),
  });

  if (committed === 'ROOM_FULL') {
    try {
      await remove(playerRef(gameId, uid));
    } catch {
      // Best-effort rollback.
    }
    throw new Error('ROOM_FULL');
  }
  if (committed === 'ROOM_NOT_FOUND') {
    const rollback = await rollbackJoinPlayerIfSessionMissing(gameId, uid);
    if (rollback === 'ROOM_NOT_FOUND') {
      throw new Error('ROOM_NOT_FOUND');
    }
  }

  await setPlayerOnlinePresence(gameId, uid);
  let joined = await readSessionSnapshot(gameId);
  if (sessionIdentityMasked(joined)) {
    await syncPublicRosterAliases(gameId, joined);
    joined = await readSessionSnapshot(gameId);
  }
  if (joined.isPublic) {
    await syncPublicLobbyPlayerCount(gameId, joined);
  }
  return joined;
}

/**
 * Rewrite session player totals from wordPlayers when they drift (e.g. solo → 3+).
 * Pass `mapsOverride` from a live listener to skip a redundant RTDB read on play.
 */
export async function syncSessionPlayerScores(
  gameId: string,
  mapsOverride?: SessionWordMaps,
): Promise<void> {
  await ensureAnonymousAuth();
  const normalized = normalizeRoomCode(gameId);
  const maps = mapsOverride ?? (await fetchSessionWordMaps(normalized));
  if (Object.keys(maps.wordPlayers ?? {}).length === 0) {
    return;
  }
  const preSnapshot = await get(sessionRef(normalized));
  if (!preSnapshot.exists()) {
    return;
  }
  const session = preSnapshot.val() as GameSession;
  if (session.status !== 'playing') {
    return;
  }
  const uniqueBonusEnabled = resolveGameSessionSettingsForSession(session).uniqueBonusEnabled;

  try {
    await runRtdbTransaction(playersRef(normalized), (current) => {
      if (current == null || typeof current !== 'object') {
        return undefined;
      }

      const players = Object.fromEntries(
        Object.entries(current as GameSession['players']).map(([playerId, player]) => [
          playerId,
          { ...player },
        ]),
      );
      recomputeSessionPlayerScores({ players, wordPlayers: maps.wordPlayers }, uniqueBonusEnabled);

      let changed = false;
      for (const [playerId, player] of Object.entries(players)) {
        const stored = (current as GameSession['players'])[playerId];
        if (stored?.score !== player.score || stored?.wordCount !== player.wordCount) {
          changed = true;
          break;
        }
      }

      if (!changed) {
        return undefined;
      }

      return players;
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
  let unsub: Unsubscribe | null = null;
  let cancelled = false;

  void import('./app-check.js')
    .then(({ ensureFirebaseAppCheck }) => ensureFirebaseAppCheck())
    .then(() => {
      if (cancelled) {
        return;
      }
      unsub = onValue(
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
          listener({ id: normalized, ...stripWordMapsFromSession(session) });
        },
        (error) => {
          if (__DEV__) {
            console.warn('subscribeGameSession', error);
          }
          listener(null);
        },
      );
    });

  return () => {
    cancelled = true;
    unsub?.();
  };
}

/**
 * Mark player online and register onDisconnect → offline.
 * Skips players who voluntarily left (`hasLeft`); use `rejoinExistingPlayer` to opt back in.
 * No-ops while the app is backgrounded so auto-rejoin cannot resurrect presence after AppState offline.
 */
export async function markPlayerOnline(gameId: string, uid: string): Promise<void> {
  if (!shouldMarkPresenceOnline(AppState.currentState)) {
    return;
  }
  const normalized = normalizeRoomCode(gameId);
  if (isVoluntaryLeaveInFlight(normalized, uid)) {
    return;
  }
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
    if (!shouldMarkPresenceOnline(AppState.currentState)) {
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
 * Re-mark online when RTDB reconnects, but only while the app is in the foreground.
 * Background reconnect must not resurrect `online` after intentional AppState offline.
 */
export function subscribePlayerOnlinePresence(gameId: string, uid: string): Unsubscribe {
  const connectedRef = ref(getFirebaseDatabase(), '.info/connected');
  return onValue(connectedRef, (snapshot) => {
    if (snapshot.val() === true && shouldMarkPresenceOnline(AppState.currentState)) {
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

  const updates: {
    settings: GameSessionSettings;
    baseWord?: string;
    baseWordChosenBy?: string;
  } = {
    settings: applyPublicContentSafety(payload.settings, session),
  };
  if (payload.baseWord !== undefined) {
    if (!payload.baseWord || payload.baseWord.length < 2) {
      throw new Error('BASE_WORD_MISSING');
    }
    await assertSessionBaseWordAllowed(payload.baseWord, session);
    updates.baseWord = payload.baseWord;
    updates.baseWordChosenBy = actorUid;
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
  await assertSessionBaseWordAllowed(baseWord, session);

  await update(sessionRef(normalized), { baseWord, baseWordChosenBy: uid });
}

/** Fix parking from uniqueBonusMode - updateGameSessionSetup receives uniqueBonusEnabled boolean already */

/**
 * Start the round: current base-word picker (or organizer) sets playing + server timer.
 */
export async function startGameSession(gameId: string, actorUid: string): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  await syncLobbyPickerState(normalized);
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
  await assertSessionBaseWordAllowed(session.baseWord, session);

  const settings = resolveRoundStartSettings(session);
  const now = getServerNow();

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

  await clearSessionWordMaps(normalized);

  if (session.isPublic) {
    await unpublishPublicLobby(normalized, actorUid, { force: true });
  }

  const rootRef = ref(getFirebaseDatabase());
  const multiPath = buildRoundStartWritePaths({
    gameId: normalized,
    session,
    actorUid,
    now,
    settings,
  });
  await update(rootRef, multiPath);
}

/**
 * Leave room — keep player in session for standings/results (TZ).
 */
export async function leaveGameSession(gameId: string, uid: string): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  beginVoluntaryLeave(normalized, uid);
  try {
    const node = playerRef(normalized, uid);
    await onDisconnect(node).cancel();
    await update(node, { online: false, hasLeft: true });
    try {
      await syncLobbyPickerState(normalized);
    } catch (error) {
      if (__DEV__) {
        console.warn('leaveGameSession picker sync', error);
      }
    }
    try {
      await reconcileOpenSessionVotes(normalized);
    } catch (error) {
      if (__DEV__) {
        console.warn('leaveGameSession vote cleanup', error);
      }
    }

    try {
      const sessionSnap = await get(sessionRef(normalized));
      if (sessionSnap.exists()) {
        await reconcilePublicLobbyAfterRosterChange(normalized, sessionSnap.val() as GameSession);
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('leaveGameSession public lobby reconcile', error);
      }
    }
  } finally {
    endVoluntaryLeave(normalized, uid);
  }
}

/**
 * Presence unmount safety net: full waiting-lobby leave for non-organizers.
 */
export async function voluntaryLeaveWaitingLobbyIfMember(
  gameId: string,
  uid: string,
): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  try {
    const snapshot = await get(sessionRef(normalized));
    if (!snapshot.exists()) {
      await markPlayerOffline(normalized, uid);
      return;
    }
    const session = snapshot.val() as GameSession;
    const player = session.players[uid];
    if (!player) {
      return;
    }
    if (player.hasLeft === true && player.online !== true) {
      return;
    }
    if (session.status === 'waiting' && session.organizerId !== uid) {
      await leaveGameSession(normalized, uid);
      return;
    }
    await markPlayerOffline(normalized, uid);
  } catch (error) {
    if (isFirebasePermissionDenied(error)) {
      return;
    }
    throw error;
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
export async function finishGameSessionIfExpired(
  gameId: string,
  mapsOverride?: SessionWordMaps,
): Promise<boolean> {
  const normalized = normalizeRoomCode(gameId);
  await ensureAnonymousAuth();
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
  const wordMaps = mapsOverride ?? (await fetchSessionWordMaps(normalized));
  try {
    const result = await runRtdbTransaction(sessionRef(normalized), (current) => {
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
      const uniqueBonusEnabled = resolveGameSessionSettingsForSession(session).uniqueBonusEnabled;
      if (Object.keys(wordMaps.wordPlayers ?? {}).length > 0) {
        recomputeSessionPlayerScores(
          { ...session, wordPlayers: wordMaps.wordPlayers },
          uniqueBonusEnabled,
        );
      }
      const finishAt = session.timerEndsAt;
      const roundPlayedSeconds = computeRoundPlayedSecondsAtFinish(session, finishAt);
      return withFinishedPurgeFields(
        {
          ...session,
          status: 'finished',
          timerEndsAt: null,
          addTimeVote: null,
          pauseState: null,
          pauseVote: null,
          resumeVote: null,
          roundPlayedSeconds,
        },
        finishAt,
      );
    });
    return result.committed;
  } catch (error) {
    if (isFirebaseIgnorableRtdbError(error)) {
      return false;
    }
    throw error;
  }
}

/**
 * Force-finish round (organizer / dev).
 */
export async function finishGameSession(
  gameId: string,
  mapsOverride?: SessionWordMaps,
): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  await ensureAnonymousAuth();
  const finishedAt = getServerNow();
  const wordMaps = mapsOverride ?? (await fetchSessionWordMaps(normalized));
  await runRtdbTransaction(sessionRef(normalized), (current) => {
    if (current == null) {
      return undefined;
    }
    const session = current as GameSession;
    if (session.status !== 'playing') {
      return undefined;
    }
    const uniqueBonusEnabled = resolveGameSessionSettingsForSession(session).uniqueBonusEnabled;
    if (Object.keys(wordMaps.wordPlayers ?? {}).length > 0) {
      recomputeSessionPlayerScores(
        { ...session, wordPlayers: wordMaps.wordPlayers },
        uniqueBonusEnabled,
      );
    }
    const roundPlayedSeconds = computeRoundPlayedSecondsAtFinish(session, finishedAt);
    return withFinishedPurgeFields(
      {
        ...session,
        status: 'finished',
        timerEndsAt: null,
        pauseState: null,
        pauseVote: null,
        resumeVote: null,
        roundPlayedSeconds,
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
  await clearSessionWordMaps(normalized);

  if (preSession.isPublic) {
    await unpublishPublicLobby(normalized, actorUid, { force: true });
  }

  const playerIds = Object.keys(preSession.players);
  const resolvedSettings = resolveGameSessionSettings(preSession.settings, playerIds.length);
  const nextBaseWordRound = (preSession.baseWordRound ?? 0) + 1;
  const players: Record<string, GameSessionPlayer> = {};
  for (const uid of playerIds) {
    players[uid] = {
      ...preSession.players[uid],
      ...rematchWaitingPlayerPatch(preSession, uid, actorUid),
    };
  }

  const waitingSession: GameSession = {
    ...preSession,
    status: 'waiting',
    baseWord: '',
    baseWordChosenBy: null,
    baseWordRound: nextBaseWordRound,
    players,
  };
  const baseWordPickerUid = currentBaseWordPickerUid(waitingSession);

  try {
    await update(sessionRef(normalized), {
      status: 'waiting',
      settings: resolvedSettings,
      timerEndsAt: null,
      roundStartedAt: null,
      roundTimerBudgetSeconds: null,
      roundPlayedSeconds: null,
      baseWord: '',
      baseWordChosenBy: null,
      baseWordRound: nextBaseWordRound,
      baseWordPickerUid,
      earlyFinishVote: null,
      pauseVote: null,
      pauseState: null,
      resumeVote: null,
      purgeAfterAt: null,
      finishedAt: null,
      resultsExitedBy: null,
      liveRoundPlayerUids: null,
      isPublic: false,
      publicPublishedAt: null,
      players,
    });
  } catch (error) {
    if (isFirebasePermissionDenied(error)) {
      const again = await get(sessionRef(normalized));
      if (again.exists() && (again.val() as GameSession).status === 'waiting') {
        return;
      }
    }
    throw error;
  }

  const after = await get(sessionRef(normalized));
  if (!after.exists() || (after.val() as GameSession).status !== 'waiting') {
    throw new Error('REMATCH_FAILED');
  }
  await clearAllActiveRoundCachesForGame(normalized);
  if (actorUid === preSession.organizerId) {
    setOrganizerWaitingRoom(normalized);
  }
}

/**
 * Organizer leaves waiting lobby — delete the room only when nobody else can continue.
 */
export async function organizerLeaveWaitingLobby(
  gameId: string,
  organizerUid: string,
  session: GameSession,
): Promise<void> {
  await markPlayerOffline(gameId, organizerUid);
  if (shouldOrganizerAbandonWaitingRoom(session, organizerUid)) {
    await abandonWaitingGameSession(gameId, organizerUid);
    return;
  }
  await leaveGameSession(gameId, organizerUid);
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
  if (session.isPublic) {
    await unpublishPublicLobby(normalized, organizerUid, { force: true });
  }
  const playerIds = Object.keys(session.players);
  await Promise.all(playerIds.map((playerUid) => cancelPlayerOnDisconnect(normalized, playerUid)));
  await clearAllPlayerWords(normalized, playerIds, organizerUid, organizerUid);
  await clearSessionWordMaps(normalized);
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
