/**
 * Runtime invariant checks for online multiplayer state transitions.
 * Throws only in dev and test — production logs are avoided to prevent user-facing crashes.
 */

import type { GameSession, GameSessionPlayer, GameSessionSettings } from '../firebase/types.js';

export function shouldAssertOnlineInvariants(): boolean {
  return (typeof __DEV__ !== 'undefined' && __DEV__ === true) || process.env.NODE_ENV === 'test';
}

function invariantFailure(message: string): void {
  if (!shouldAssertOnlineInvariants()) {
    return;
  }
  throw new Error(`[online-invariant] ${message}`);
}

/** Non-opt-in rematch waiting players stay in roster with offline presence, not marked left. */
export function assertRematchWaitingPlayerPatch(
  playerId: string,
  optedIn: boolean,
  patch: Pick<GameSessionPlayer, 'online' | 'hasLeft'>,
): void {
  if (patch.hasLeft === true) {
    invariantFailure(`rematch waiting patch for ${playerId}: hasLeft must be false (got true)`);
  }
  if (optedIn && patch.online !== true) {
    invariantFailure(`rematch waiting patch for ${playerId}: opted-in player must be online`);
  }
  if (!optedIn && patch.online !== false) {
    invariantFailure(`rematch waiting patch for ${playerId}: non-opt-in player must be offline`);
  }
}

/** Rematch bootstrap must not carry finished-round coordination fields into waiting. */
export function assertRematchBootstrapSessionShape(session: GameSession): void {
  if (session.status !== 'waiting') {
    invariantFailure(`rematch bootstrap session must be waiting (got ${session.status})`);
  }
  if (session.resultsExitedBy != null) {
    invariantFailure('rematch bootstrap session must clear resultsExitedBy');
  }
  if (session.wordPlayers != null) {
    invariantFailure('rematch bootstrap session must not include wordPlayers');
  }
  if (session.purgeAfterAt != null) {
    invariantFailure('rematch bootstrap session must not include purgeAfterAt');
  }
}

/** Voluntarily left players must not appear in rematch waiting lobby visibility. */
export function assertLobbyVisiblePlayerState(
  uid: string,
  player: GameSessionPlayer | undefined,
  visible: boolean,
): void {
  if (player?.hasLeft === true && visible) {
    invariantFailure(`lobby visibility for ${uid}: hasLeft players must not be visible`);
  }
}

/** Early-finish / pause voters must be active live-round participants, never the proposer. */
export function assertActiveLivePlayerVoteEligibility(
  session: Pick<GameSession, 'status' | 'baseWordRound' | 'liveRoundPlayerUids' | 'players'>,
  playerId: string,
  proposerId: string,
): void {
  if (playerId === proposerId) {
    invariantFailure(`vote eligibility for ${playerId}: proposer must not be a required voter`);
  }
  if (session.status !== 'playing') {
    invariantFailure(`vote eligibility for ${playerId}: session must be playing`);
  }
  const round = session.baseWordRound ?? 0;
  if (round > 0) {
    const uids = session.liveRoundPlayerUids;
    if (!uids || uids.length === 0 || !uids.includes(playerId)) {
      invariantFailure(`vote eligibility for ${playerId}: must be in liveRoundPlayerUids`);
    }
  }
  const player = session.players[playerId];
  if (!player) {
    invariantFailure(`vote eligibility for ${playerId}: player missing from roster`);
  }
  if (player.hasLeft === true && player.online !== true) {
    invariantFailure(`vote eligibility for ${playerId}: voluntarily left players cannot vote`);
  }
  if (player.online !== true) {
    invariantFailure(`vote eligibility for ${playerId}: must be online in the live round`);
  }
}

/** Base-word picker must be online and not voluntarily left. */
export function assertBaseWordPickerEligibility(
  uid: string,
  player: GameSessionPlayer | undefined,
): void {
  if (!player) {
    invariantFailure(`base word picker ${uid}: player must exist in roster`);
    return;
  }
  if (player.hasLeft === true) {
    invariantFailure(`base word picker ${uid}: hasLeft players cannot pick`);
  }
  if (player.online !== true) {
    invariantFailure(`base word picker ${uid}: picker must be online`);
  }
}

/** x2 must latch on at 3+ in auto mode and never turn off mid-round once enabled. */
export function assertUniqueBonusRoundLatch(
  session: { status?: GameSession['status']; settings?: GameSessionSettings | null },
  resolved: GameSessionSettings,
): void {
  if (session.status !== 'playing' && session.status !== 'finished') {
    return;
  }
  const mode = session.settings?.uniqueBonusMode;
  const effectiveMode =
    mode === 'auto' || mode === 'off'
      ? mode
      : session.settings?.uniqueBonusEnabled
        ? 'auto'
        : 'off';
  if (effectiveMode === 'off' && resolved.uniqueBonusEnabled) {
    invariantFailure('uniqueBonusEnabled must stay off when uniqueBonusMode is off');
  }
  if (session.settings?.uniqueBonusEnabled === true && !resolved.uniqueBonusEnabled) {
    invariantFailure('uniqueBonusEnabled cannot turn off mid-round once latched on');
  }
}

/** Viewing a prior round while live advanced requires offline presence for the viewer. */
export function assertPresenceOfflineOnPriorRoundView(
  frozenBaseWordRound: number | null | undefined,
  liveBaseWordRound: number,
  shouldMarkOffline: boolean,
): void {
  if (
    frozenBaseWordRound != null &&
    frozenBaseWordRound < liveBaseWordRound &&
    !shouldMarkOffline
  ) {
    invariantFailure(
      `presence for frozen round ${frozenBaseWordRound}: must mark offline when live is round ${liveBaseWordRound}`,
    );
  }
}
