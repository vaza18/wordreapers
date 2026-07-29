import {
  child,
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
import { presenceWriteQueue } from '../online/presence/presence-write-queue.js';
import { shouldLeaveWaitingLobbyOnPresenceUnmount } from '../online/presence/presence-unmount-leave.js';
import { devLogAction } from '../debug/dev-log.js';

import { isOrphanGameSessionShell, orphanShellHasPlayer } from '../online/orphan-game-session.js';
import type { PlayerProfile } from '../profile/player-profile.js';

import {
  currentBaseWordPickerUid,
  shouldClearLobbyBaseWordForPicker,
} from '../online/base-word-picker.js';
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
import { buildPlayerTotalsUpdatePatch, recomputeSessionPlayerScores } from '../game/scoring.js';
import { appendLiveRoundPlayerUid } from './live-round-player-uids.js';
import { formatLiveRosterDetails } from '../debug/format-session-roster-log.js';
import {
  isActiveLivePlayer,
  liveRoundPlayerUidsForRoundStart,
  rematchWaitingPlayerPatch,
} from '../online/presence/live-round-membership.js';
import { shouldOrganizerAbandonWaitingRoom } from '../online/should-organizer-abandon-waiting-room.js';
import { computeRoundPlayedSecondsAtFinish } from '../game/round-duration.js';
import { reconcileOpenSessionVotes } from './session-votes-service.js';
import {
  clearAllPlayerWords,
  clearWaitingLobbyPlayerWordsAsOrganizer,
} from './player-words-service.js';
import { markResultsExited } from './results-coordination-service.js';
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

function joinSourceLabel(options?: JoinGameSessionOptions): string {
  if (options?.joinSource === 'browse') {
    return 'via browse';
  }
  if (options?.invitedByUid) {
    return 'via invite/QR';
  }
  return 'via code';
}

function logLocalJoin(
  session: GameSessionSnapshot,
  actorName: string,
  options?: JoinGameSessionOptions,
): void {
  const waiting = session.status === 'waiting';
  const playing = session.status === 'playing';
  const action = waiting
    ? 'joined room; waiting in lobby'
    : playing
      ? 'joined live round'
      : `joined room; status=${session.status}`;
  devLogAction(action, {
    actor: actorName,
    room: session.id,
    round: session.baseWordRound ?? 0,
    details: joinSourceLabel(options),
  });
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

/**
 * Blocks mark-online / mark-offline races while a voluntary leave is in flight
 * (waiting lobby or intentional leave from a live round before hasLeft is written).
 */
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
  const generation = presenceWriteQueue.begin(normalized, uid, 'online');
  const node = playerRef(normalized, uid);
  try {
    await onDisconnect(node).cancel();
    if (!presenceWriteQueue.isCurrent(normalized, uid, generation, 'online')) {
      return;
    }
    if (
      isVoluntaryLeaveInFlight(normalized, uid) ||
      !shouldMarkPresenceOnline(AppState.currentState)
    ) {
      return;
    }
    await update(node, { online: true });
    if (!presenceWriteQueue.isCurrent(normalized, uid, generation, 'online')) {
      await repairPresenceIntentIfNeeded(normalized, uid);
      return;
    }
    await onDisconnect(node).update({ online: false });
    // Do not reconcile picker/word here: late joiner `online: true` raced
    // `reconcileLobbyPickerState` against a peer briefly offline / stale hasLeft and
    // cleared the rightful base word (lobby list blink + «Гравці (1)» steal). Lobby
    // `useEffect` already calls `syncLobbyPickerState` when the session drifts.
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

  if (shouldClearLobbyBaseWordForPicker(session)) {
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
 *
 * Critical path: write `online: false` BEFORE canceling onDisconnect. On real devices
 * (especially Android), the JS runtime often suspends right after AppState `background`.
 * Canceling first removed the disconnect safety net and left the offline update unsent,
 * so peers kept seeing «в грі».
 *
 * If a newer `online` intent supersedes this write mid-flight, repair `online: true`
 * so a late offline update cannot leave the unlocking client stuck «не в грі» locally
 * while peers already saw the return (or the reverse on lock).
 */
export async function markPlayerOffline(gameId: string, uid: string): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  // Intentional leave navigates away before leaveGameSession writes hasLeft; skip the
  // intermediate online:false-only write so peers do not toast «не в грі» then «залишив гру».
  if (isVoluntaryLeaveInFlight(normalized, uid)) {
    return;
  }
  const generation = presenceWriteQueue.begin(normalized, uid, 'offline');
  const node = playerRef(normalized, uid);
  try {
    await update(node, { online: false });
    if (!presenceWriteQueue.isCurrent(normalized, uid, generation, 'offline')) {
      try {
        await repairPresenceIntentIfNeeded(normalized, uid);
      } catch (error) {
        if (__DEV__) {
          console.warn('markPlayerOffline presence repair', error);
        }
      }
      return;
    }
    await cancelPlayerOnDisconnect(normalized, uid);
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

/**
 * After a superseded presence write, force RTDB to match the winning intent.
 * Fixes unlock races where a late `online: false` lands after `markPlayerOnline`.
 */
async function repairPresenceIntentIfNeeded(gameId: string, uid: string): Promise<void> {
  if (isVoluntaryLeaveInFlight(gameId, uid)) {
    return;
  }
  let intent: 'online' | 'offline' | null;
  try {
    intent = presenceWriteQueue.latestIntent(gameId, uid);
  } catch {
    // Metro HMR can leave a stale module — skip repair rather than crash.
    return;
  }
  if (intent === 'online') {
    if (!shouldMarkPresenceOnline(AppState.currentState)) {
      return;
    }
    await setPlayerOnlinePresence(gameId, uid);
    return;
  }
  if (intent === 'offline') {
    await update(playerRef(gameId, uid), { online: false });
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
  const parsed = gameSessionSnapshotFromRtdbVal(normalized, snapshot.val());
  if (!parsed) {
    throw new Error('ROOM_NOT_FOUND');
  }
  return parsed;
}

/** Fresh RTDB session read for routing after rematch / rejoin. */
export async function readGameSessionSnapshot(gameId: string): Promise<GameSessionSnapshot> {
  return readSessionSnapshot(gameId);
}

/**
 * Like `readGameSessionSnapshot`, but returns null when the room root is absent.
 * Permission-denied is rethrown — callers must not treat App Check / auth glitches as room-gone.
 */
export async function tryReadGameSessionSnapshot(
  gameId: string,
): Promise<GameSessionSnapshot | null> {
  try {
    return await readSessionSnapshot(gameId);
  } catch (error) {
    if (error instanceof Error && error.message === 'ROOM_NOT_FOUND') {
      return null;
    }
    throw error;
  }
}

/**
 * Rejoin a rostered player who left or went offline (clears `hasLeft`, restores presence).
 * Player online + liveRoundPlayerUids append are one session update so routing cannot see
 * online without roster membership (QR rejoin → results while peers still playing).
 *
 * Presence/lobby reconcile must not resurrect intentional Home/`hasLeft` leavers — only
 * explicit opt-in (`reviveAfterLeave`, join, «Грати ще») may clear `hasLeft`.
 */
export type RejoinExistingPlayerOptions = {
  reviveAfterLeave?: boolean;
};

export async function rejoinExistingPlayer(
  gameId: string,
  uid: string,
  profile: PlayerProfile,
  options?: RejoinExistingPlayerOptions,
): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  if (isVoluntaryLeaveInFlight(normalized, uid)) {
    return;
  }
  const sessionSnapshot = await get(sessionRef(normalized));
  if (sessionSnapshot.exists()) {
    const prior = (sessionSnapshot.val() as GameSession).players?.[uid];
    if (prior?.hasLeft === true && options?.reviveAfterLeave !== true) {
      return;
    }
  }
  if (isVoluntaryLeaveInFlight(normalized, uid)) {
    return;
  }
  const patch: Record<string, unknown> = {};
  const profileFields = profilePatch(profile);
  for (const [key, value] of Object.entries(profileFields)) {
    patch[`players/${uid}/${key}`] = value;
  }
  patch[`players/${uid}/online`] = true;
  patch[`players/${uid}/hasLeft`] = false;
  if (sessionSnapshot.exists()) {
    const session = sessionSnapshot.val() as GameSession;
    if (session.status === 'playing') {
      patch.liveRoundPlayerUids = appendLiveRoundPlayerUid(session.liveRoundPlayerUids, uid);
    }
  }
  await update(sessionRef(normalized), patch);
  await setPlayerOnlinePresence(normalized, uid);
  if (sessionSnapshot.exists()) {
    const session = sessionSnapshot.val() as GameSession;
    const prior = session.players?.[uid];
    const round = session.baseWordRound ?? 0;
    const nextLive =
      session.status === 'playing'
        ? appendLiveRoundPlayerUid(session.liveRoundPlayerUids, uid)
        : (session.liveRoundPlayerUids ?? []);
    const selfPlayer = {
      ...(prior ?? { name: profile.name, wordCount: 0, score: 0 }),
      online: true as const,
      hasLeft: false as const,
    };
    const rosterDetails = formatLiveRosterDetails(
      {
        ...session,
        players: {
          ...session.players,
          [uid]: selfPlayer,
        },
        liveRoundPlayerUids: nextLive,
      },
      nextLive,
    );
    if (prior?.hasLeft === true) {
      devLogAction('rejoined room after leaving', {
        actor: profile.name,
        room: normalized,
        round,
        details: `status=${session.status} ${rosterDetails}`,
      });
    } else if (prior && prior.online !== true) {
      devLogAction('rejoined room (was offline)', {
        actor: profile.name,
        room: normalized,
        round,
        details: `status=${session.status} ${rosterDetails}`,
      });
    } else {
      devLogAction('synced roster presence', {
        level: 'detail',
        actor: profile.name,
        room: normalized,
        round,
        details: `status=${session.status} ${rosterDetails}`,
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
    const maskedJoined = await readSessionSnapshot(gameId);
    logLocalJoin(maskedJoined, profile.name, options);
    return maskedJoined;
  }
  if (joined.isPublic) {
    await syncPublicLobbyPlayerCount(gameId, joined);
  }
  logLocalJoin(joined, profile.name, options);
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
      const playersForTotals = Object.fromEntries(
        Object.entries(sessionAfterJoin.players).map(([playerId, player]) => [
          playerId,
          { ...player },
        ]),
      );
      recomputeSessionPlayerScores(
        { players: playersForTotals, wordPlayers: context.wordMaps.wordPlayers },
        bonusEnabled,
      );
      // Leaf score/wordCount only — a full `players` rewrite fails rules (peers' `online`)
      // and used to abort liveRoundPlayerUids + x2 latch in the same atomic update.
      Object.assign(patch, buildPlayerTotalsUpdatePatch(playersForTotals, session.players ?? {}));
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
  // Presence-only / corrupted roots (no status + organizerId) are not joinable rooms.
  if (isOrphanGameSessionShell(session)) {
    throw new Error('ROOM_NOT_FOUND');
  }

  if (
    session.status !== 'waiting' &&
    session.status !== 'playing' &&
    session.status !== 'finished'
  ) {
    throw new Error('ROOM_NOT_JOINABLE');
  }

  if (session.players[uid]) {
    await rejoinExistingPlayer(gameId, uid, profile, { reviveAfterLeave: true });
    let updated = await readSessionSnapshot(gameId);
    // One retry if playing but not yet active (rare read/write lag after atomic rejoin).
    if (updated.status === 'playing' && !isActiveLivePlayer(updated, uid)) {
      await rejoinExistingPlayer(gameId, uid, profile, { reviveAfterLeave: true });
      updated = await readSessionSnapshot(gameId);
    }
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
  logLocalJoin(joined, profile.name, options);
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
  const players = Object.fromEntries(
    Object.entries(session.players).map(([playerId, player]) => [playerId, { ...player }]),
  );
  recomputeSessionPlayerScores({ players, wordPlayers: maps.wordPlayers }, uniqueBonusEnabled);
  const patch = buildPlayerTotalsUpdatePatch(players, session.players);
  if (Object.keys(patch).length === 0) {
    return;
  }

  try {
    // Leaf updates avoid transactions on the whole `players` map (maxretry vs presence/score races).
    await update(sessionRef(normalized), patch);
  } catch (error) {
    if (__DEV__) {
      console.warn('syncSessionPlayerScores', error);
    }
  }
}

/** Parse an RTDB `game_sessions/{id}` payload into a client snapshot (or null). */
export function gameSessionSnapshotFromRtdbVal(
  gameId: string,
  raw: unknown,
): GameSessionSnapshot | null {
  const normalized = normalizeRoomCode(gameId);
  if (raw == null) {
    return null;
  }
  if (isOrphanGameSessionShell(raw)) {
    return null;
  }
  return { id: normalized, ...stripWordMapsFromSession(raw as GameSession) };
}

/**
 * Subscribe to session updates (lobby / play).
 * Multiple callers for the same room share one RTDB `onValue` (ref-counted).
 */
type SharedSessionSub = {
  listeners: Set<(session: GameSessionSnapshot | null) => void>;
  unsub: Unsubscribe | null;
  last: GameSessionSnapshot | null | undefined;
};

const sharedGameSessionSubs = new Map<string, SharedSessionSub>();

/** Test-only: drop shared session listeners between cases. */
export function resetSharedGameSessionSubscriptionsForTests(): void {
  for (const entry of sharedGameSessionSubs.values()) {
    entry.unsub?.();
  }
  sharedGameSessionSubs.clear();
}

export function subscribeGameSession(
  gameId: string,
  listener: (session: GameSessionSnapshot | null) => void,
): Unsubscribe {
  const normalized = normalizeRoomCode(gameId);
  let entry = sharedGameSessionSubs.get(normalized);
  if (!entry) {
    entry = {
      listeners: new Set(),
      unsub: null,
      last: undefined,
    };
    sharedGameSessionSubs.set(normalized, entry);

    void import('./app-check.js')
      .then(({ ensureFirebaseAppCheck }) => ensureFirebaseAppCheck())
      .catch((error) => {
        if (__DEV__) {
          console.warn('subscribeGameSession app check', error);
        }
      })
      .then(() => {
        const current = sharedGameSessionSubs.get(normalized);
        if (!current || current.listeners.size === 0) {
          return;
        }
        current.unsub = onValue(
          sessionRef(normalized),
          (snapshot) => {
            const live = sharedGameSessionSubs.get(normalized);
            if (!live) {
              return;
            }
            let next: GameSessionSnapshot | null = null;
            if (snapshot.exists()) {
              const raw = snapshot.val();
              if (isOrphanGameSessionShell(raw)) {
                const uid = getFirebaseUid();
                if (uid && orphanShellHasPlayer(raw, uid)) {
                  void removeOrphanGameSessionShell(normalized, uid);
                }
                next = null;
              } else {
                next = gameSessionSnapshotFromRtdbVal(normalized, raw);
              }
            }
            live.last = next;
            for (const fn of [...live.listeners]) {
              fn(next);
            }
          },
          (error) => {
            // Transient App Check / network / auth glitches must not wipe the last
            // good snapshot — callers treat null as confirmed room-gone (eject UI).
            devLogAction('subscribeGameSession listener error', {
              level: 'error',
              room: normalized,
              details: error instanceof Error ? error.message : String(error),
            });
          },
        );
      });
  }

  entry.listeners.add(listener);
  if (entry.last !== undefined) {
    listener(entry.last);
  }

  return () => {
    const current = sharedGameSessionSubs.get(normalized);
    if (!current) {
      return;
    }
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      current.unsub?.();
      sharedGameSessionSubs.delete(normalized);
    }
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
  let unsub: Unsubscribe | null = null;
  let cancelled = false;

  void import('./app-check.js')
    .then(({ ensureFirebaseAppCheck }) => ensureFirebaseAppCheck())
    .catch((error) => {
      if (__DEV__) {
        console.warn('subscribePlayerOnlinePresence app check', error);
      }
    })
    .then(() => {
      if (cancelled) {
        return;
      }
      // Still subscribe if App Check failed: presence must not silently drop while
      // Console enforcement is off; RTDB will reject once enforcement is on.
      unsub = onValue(connectedRef, (snapshot) => {
        if (snapshot.val() === true && shouldMarkPresenceOnline(AppState.currentState)) {
          void markPlayerOnline(gameId, uid);
        }
      });
    });

  return () => {
    cancelled = true;
    unsub?.();
  };
}

/**
 * Organizer or current base-word picker updates round settings (and optionally base word).
 * Base word may only be set by the current picker (not merely the organizer).
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
    if (!isPicker) {
      throw new Error('NOT_BASE_WORD_PICKER');
    }
    if (!payload.baseWord || payload.baseWord.length < 2) {
      throw new Error('BASE_WORD_MISSING');
    }
    await assertSessionBaseWordAllowed(payload.baseWord, session);
    // Re-read: peer may have taken the seat while dictionary validation ran (ZF6U4).
    const latestSnap = await get(sessionRef(normalized));
    if (!latestSnap.exists()) {
      throw new Error('ROOM_NOT_FOUND');
    }
    const latest = latestSnap.val() as GameSession;
    if (latest.status !== 'waiting') {
      throw new Error('ROOM_NOT_WAITING');
    }
    if (currentBaseWordPickerUid(latest) !== actorUid) {
      throw new Error('NOT_BASE_WORD_PICKER');
    }
    updates.baseWord = payload.baseWord;
    updates.baseWordChosenBy = actorUid;
  }

  await update(sessionRef(normalized), updates);
  if (payload.baseWord !== undefined) {
    devLogAction(`picked base word "${payload.baseWord}"`, {
      room: normalized,
      round: session.baseWordRound ?? 0,
      details: `duration=${payload.settings.durationSeconds}s uniqueBonus=${payload.settings.uniqueBonusMode}`,
    });
  } else {
    devLogAction('updated round settings', {
      level: 'detail',
      room: normalized,
      round: session.baseWordRound ?? 0,
      details: `duration=${payload.settings.durationSeconds}s uniqueBonus=${payload.settings.uniqueBonusMode}`,
    });
  }
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
  devLogAction(`picked base word "${baseWord}"`, {
    room: normalized,
    round: session.baseWordRound ?? 0,
  });
}

/** Fix parking from uniqueBonusMode - updateGameSessionSetup receives uniqueBonusEnabled boolean already */

/**
 * Start the round: current base-word picker sets playing + server timer.
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
  const liveUids = liveRoundPlayerUidsForRoundStart(session, actorUid);
  devLogAction('started round', {
    room: normalized,
    round: session.baseWordRound ?? 0,
    details: `baseWord="${session.baseWord}" ${formatLiveRosterDetails(session, liveUids)}`,
  });
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
    devLogAction('left the round early', { room: normalized });
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
  if (isVoluntaryLeaveInFlight(normalized, uid)) {
    return;
  }
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
    if (shouldLeaveWaitingLobbyOnPresenceUnmount(session, uid)) {
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
 * Uses leaf-path `update` (not a whole-session transaction) so peer `online`/`hasLeft`
 * echoes cannot fail `.validate` (LRAHP) and results presence cannot `maxretry` the write.
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
  const patch = buildExpiredFinishLeafPatch(preSession, wordMaps);
  try {
    await update(sessionRef(normalized), patch);
    return true;
  } catch (error) {
    if (!isFirebaseIgnorableRtdbError(error)) {
      throw error;
    }
    const again = await get(sessionRef(normalized));
    if (!again.exists()) {
      return false;
    }
    return (again.val() as GameSession).status === 'finished';
  }
}

/**
 * Force-finish round (organizer / dev).
 * Leaf-path update — same presence-safe contract as `finishGameSessionIfExpired`.
 */
export async function finishGameSession(
  gameId: string,
  mapsOverride?: SessionWordMaps,
): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  await ensureAnonymousAuth();
  const preSnapshot = await get(sessionRef(normalized));
  if (!preSnapshot.exists()) {
    return;
  }
  const preSession = preSnapshot.val() as GameSession;
  if (preSession.status !== 'playing') {
    return;
  }
  const finishedAt = getServerNow();
  const wordMaps = mapsOverride ?? (await fetchSessionWordMaps(normalized));
  const patch = buildForceFinishLeafPatch(preSession, wordMaps, finishedAt);
  try {
    await update(sessionRef(normalized), patch);
  } catch (error) {
    if (!isFirebaseIgnorableRtdbError(error)) {
      throw error;
    }
  }
  await clearAllActiveRoundCachesForGame(normalized);
}

/** Leaf patch for timer-expired finish — never writes `online`/`hasLeft`. */
function buildExpiredFinishLeafPatch(
  session: GameSession,
  wordMaps: SessionWordMaps,
): Record<string, unknown> {
  const finishAt = session.timerEndsAt as number;
  return buildFinishLeafPatch(session, wordMaps, finishAt);
}

function buildForceFinishLeafPatch(
  session: GameSession,
  wordMaps: SessionWordMaps,
  finishedAt: number,
): Record<string, unknown> {
  return buildFinishLeafPatch(session, wordMaps, finishedAt);
}

function buildFinishLeafPatch(
  session: GameSession,
  wordMaps: SessionWordMaps,
  finishedAt: number,
): Record<string, unknown> {
  const players: GameSession['players'] = {};
  for (const [uid, player] of Object.entries(session.players)) {
    players[uid] = { ...player };
  }
  const uniqueBonusEnabled = resolveGameSessionSettingsForSession(session).uniqueBonusEnabled;
  if (Object.keys(wordMaps.wordPlayers ?? {}).length > 0) {
    recomputeSessionPlayerScores(
      { players, wordPlayers: wordMaps.wordPlayers },
      uniqueBonusEnabled,
    );
  }
  const roundPlayedSeconds = computeRoundPlayedSecondsAtFinish(session, finishedAt);
  const purged = withFinishedPurgeFields(
    {
      status: 'finished' as const,
      timerEndsAt: null,
    },
    finishedAt,
  );
  const patch: Record<string, unknown> = {
    status: 'finished',
    timerEndsAt: null,
    addTimeVote: null,
    pauseState: null,
    pauseVote: null,
    resumeVote: null,
    roundPlayedSeconds,
    finishedAt: purged.finishedAt,
    purgeAfterAt: purged.purgeAfterAt,
    ...buildPlayerTotalsUpdatePatch(players, session.players),
  };
  return patch;
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
 * Peer already opened rematch `waiting` — latch + word cleanup only.
 * Must not rewrite `players` / picker / base word (AH2TN: second «Грати ще»
 * used a stale finished snapshot and clobbered the first rematcher's lobby).
 */
async function joinAlreadyOpenRematchWaitingLobby(
  gameId: string,
  actorUid: string,
  waitingSession: GameSession,
): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  await markResultsExited(normalized, actorUid);
  await clearAllPlayerWords(
    normalized,
    Object.keys(waitingSession.players),
    actorUid,
    waitingSession.organizerId,
    { everyPlayer: actorUid === waitingSession.organizerId },
  );
  await clearSessionWordMaps(normalized);
  await clearAllActiveRoundCachesForGame(normalized);
  if (actorUid === waitingSession.organizerId) {
    setOrganizerWaitingRoom(normalized);
  }
  const after = await get(sessionRef(normalized));
  const details = after.exists() ? (after.val() as GameSession) : waitingSession;
  devLogAction('joined rematch lobby (peer already opened waiting)', {
    room: normalized,
    round: waitingSession.baseWordRound ?? 0,
    details: formatLiveRosterDetails(details),
  });
}

/**
 * Follow-up after CAS `status: finished → waiting`.
 * Does **not** write peer `online`/`hasLeft` (those leaves PD once waiting — R62F9).
 * Scores reset for everyone; actor presence only.
 */
function buildRematchWaitingFollowUpPatch(
  finishedSession: GameSession,
  actorUid: string,
  nextBaseWordRound: number,
): { patch: Record<string, unknown>; players: Record<string, GameSessionPlayer> } {
  const playerIds = Object.keys(finishedSession.players);
  const resolvedSettings = resolveGameSessionSettings(finishedSession.settings, playerIds.length);
  const players: Record<string, GameSessionPlayer> = {};
  for (const uid of playerIds) {
    players[uid] = {
      ...finishedSession.players[uid],
      ...rematchWaitingPlayerPatch(finishedSession, uid, actorUid),
    };
  }
  const waitingForPicker: GameSession = {
    ...finishedSession,
    status: 'waiting',
    baseWord: '',
    baseWordChosenBy: null,
    baseWordRound: nextBaseWordRound,
    players,
  };
  const baseWordPickerUid = currentBaseWordPickerUid(waitingForPicker);
  const patch: Record<string, unknown> = {
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
    createdAt: getServerNow(),
    purgeAfterAt: null,
    finishedAt: null,
    liveRoundPlayerUids: null,
    isPublic: false,
    publicPublishedAt: null,
    [`players/${actorUid}/online`]: true,
    [`players/${actorUid}/hasLeft`]: false,
  };
  for (const uid of playerIds) {
    patch[`players/${uid}/score`] = 0;
    patch[`players/${uid}/wordCount`] = 0;
  }
  return { patch, players };
}

/**
 * Transition a live `finished` session back to `waiting` for rematch.
 * Any rostered participant may commit (RTDB rules allow the update).
 *
 * CAS is a **status-only** transaction (`finished → waiting`) so results presence
 * leaf writes cannot `maxretry` the claim. Follow-up `update` resets scores / round
 * fields and the actor's presence — never peer `online`/`hasLeft` (those PD once
 * waiting and previously caused false "joined rematch lobby" forks — R62F9).
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
  if (!preSession.players[actorUid]) {
    throw new Error('REMATCH_FAILED');
  }
  if (preSession.status === 'waiting') {
    await joinAlreadyOpenRematchWaitingLobby(normalized, actorUid, preSession);
    return;
  }
  if (preSession.status !== 'finished') {
    throw new Error('REMATCH_FAILED');
  }

  if (preSession.isPublic) {
    await unpublishPublicLobby(normalized, actorUid, { force: true });
  }

  const rematchAttempts = 3;
  let committedWaiting: GameSession | null = null;
  let nextBaseWordRound = (preSession.baseWordRound ?? 0) + 1;

  for (let attempt = 0; attempt < rematchAttempts && !committedWaiting; attempt += 1) {
    const snap = attempt === 0 ? preSnapshot : await get(sessionRef(normalized));
    if (!snap.exists()) {
      throw new Error('REMATCH_FAILED');
    }
    const session = snap.val() as GameSession;
    if (session.status === 'waiting') {
      await joinAlreadyOpenRematchWaitingLobby(normalized, actorUid, session);
      return;
    }
    if (session.status !== 'finished' || !session.players[actorUid]) {
      throw new Error('REMATCH_FAILED');
    }

    nextBaseWordRound = (session.baseWordRound ?? 0) + 1;

    // Claim rematch without reading/writing `players` (avoids presence maxretry).
    const statusTx = await runRtdbTransaction(
      child(sessionRef(normalized), 'status'),
      (current) => (current === 'finished' ? 'waiting' : undefined),
      { applyLocally: false },
    );

    if (!statusTx.committed) {
      const again = await get(sessionRef(normalized));
      if (!again.exists()) {
        throw new Error('REMATCH_FAILED');
      }
      const againSession = again.val() as GameSession;
      if (againSession.status === 'waiting') {
        await joinAlreadyOpenRematchWaitingLobby(normalized, actorUid, againSession);
        return;
      }
      if (againSession.status !== 'finished' || !againSession.players[actorUid]) {
        throw new Error('REMATCH_FAILED');
      }
      continue;
    }

    const { patch } = buildRematchWaitingFollowUpPatch(session, actorUid, nextBaseWordRound);
    // Status CAS already won — never treat follow-up PD as "peer opened" (false join / R62F9).
    for (let followAttempt = 0; followAttempt < 3; followAttempt += 1) {
      try {
        await update(sessionRef(normalized), patch);
        break;
      } catch (error) {
        if (!isFirebaseIgnorableRtdbError(error)) {
          throw error;
        }
        if (__DEV__) {
          console.warn('rematchWaitingFollowUp', error);
        }
      }
    }

    const afterWrite = await get(sessionRef(normalized));
    if (!afterWrite.exists()) {
      throw new Error('REMATCH_FAILED');
    }
    const afterSession = afterWrite.val() as GameSession;
    if (afterSession.status !== 'waiting') {
      throw new Error('REMATCH_FAILED');
    }
    committedWaiting = afterSession;
    break;
  }

  if (!committedWaiting || committedWaiting.status !== 'waiting') {
    throw new Error('REMATCH_FAILED');
  }

  await markResultsExited(normalized, actorUid);

  await clearAllPlayerWords(
    normalized,
    Object.keys(committedWaiting.players),
    actorUid,
    committedWaiting.organizerId,
    { everyPlayer: actorUid === committedWaiting.organizerId },
  );
  await clearSessionWordMaps(normalized);

  await clearAllActiveRoundCachesForGame(normalized);
  if (actorUid === committedWaiting.organizerId) {
    setOrganizerWaitingRoom(normalized);
  }
  const after = await get(sessionRef(normalized));
  const details = after.exists() ? (after.val() as GameSession) : committedWaiting;
  devLogAction('opened rematch lobby', {
    room: normalized,
    round: nextBaseWordRound,
    details: formatLiveRosterDetails(details),
  });
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
