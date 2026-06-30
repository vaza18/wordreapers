import type { GameSession } from '../firebase/types.js';

import { isActiveLivePlayer, isInLiveRound, isLiveParticipant } from './live-round-membership.js';
import { isRematchWaitingLobby, isRematchWaitingLobbyOptedIn } from './rematch-waiting-lobby.js';
import { isReviewingPriorRoundOnPlayScreen } from './is-reviewing-prior-round-on-play.js';

export type PlayScreenContext = {
  session: Pick<GameSession, 'status' | 'baseWordRound' | 'liveRoundPlayerUids' | 'players'> & {
    timerEndsAt?: number | null;
  };
  myUid: string;
  roundEnded: boolean;
  frozenBaseWordRound: number | null | undefined;
  leavingIntentionally: boolean;
};

export type PlayScreenActions = {
  enablePresenceHook: boolean;
  shouldRejoin: boolean;
  shouldRedirectToResults: boolean;
  shouldRedirectToLobby: boolean;
  shouldMarkOfflineForPriorRound: boolean;
};

export type LobbyScreenContext = {
  session: GameSession;
  myUid: string;
  /** Navigated from results «Грати ще» — skip eject while presence catches up. */
  justOptedIn?: boolean;
};

export type LobbyScreenActions = {
  shouldNavigateToPlay: boolean;
  shouldAutoJoinLiveRound: boolean;
  shouldRedirectNonOptInViewer: boolean;
  shouldReconcileRematchWaitingPresence: boolean;
};

export type ResultsPresenceContext = {
  liveSession: Pick<GameSession, 'status' | 'baseWordRound'> | null | undefined;
  frozenBaseWordRound: number | null | undefined;
};

function isReviewingPriorRound(
  roundEnded: boolean,
  frozenBaseWordRound: number | null | undefined,
  liveBaseWordRound: number | null | undefined,
): boolean {
  return isReviewingPriorRoundOnPlayScreen(roundEnded, frozenBaseWordRound, liveBaseWordRound);
}

/** Resolve play-screen presence, rejoin, and navigation guards in one place. */
export function resolvePlayScreenActions(ctx: PlayScreenContext): PlayScreenActions {
  const { session, myUid, roundEnded, frozenBaseWordRound, leavingIntentionally } = ctx;
  const liveBaseWordRound = session.baseWordRound ?? null;
  const reviewingPriorRound = isReviewingPriorRound(
    roundEnded,
    frozenBaseWordRound,
    liveBaseWordRound,
  );
  const activeInLiveRound = isActiveLivePlayer(session, myUid);
  const inLiveRoundRoster =
    Boolean(session.players[myUid]) &&
    isInLiveRound(session, myUid) &&
    session.players[myUid]?.hasLeft !== true;
  const fullSession = session as GameSession;

  const enablePresenceHook =
    session.status === 'playing' &&
    !roundEnded &&
    !reviewingPriorRound &&
    inLiveRoundRoster &&
    !leavingIntentionally;

  let shouldRejoin = false;
  if (session.status === 'playing' && myUid && !reviewingPriorRound) {
    const player = session.players[myUid];
    if (player && (player.hasLeft === true || player.online !== true)) {
      shouldRejoin = isInLiveRound(fullSession, myUid) && player.hasLeft !== true;
    }
  }

  let shouldRedirectToResults = false;
  if (session.status === 'playing' && myUid && !leavingIntentionally && !activeInLiveRound) {
    const player = session.players[myUid];
    if (player && player.hasLeft !== true && player.online === true && !reviewingPriorRound) {
      shouldRedirectToResults = true;
    }
  }

  const shouldRedirectToLobby =
    !roundEnded &&
    !reviewingPriorRound &&
    session.status === 'waiting' &&
    session.timerEndsAt == null;

  const shouldMarkOfflineForPriorRound =
    roundEnded &&
    frozenBaseWordRound != null &&
    liveBaseWordRound != null &&
    frozenBaseWordRound < liveBaseWordRound &&
    (session.status === 'playing' || session.status === 'waiting');

  return {
    enablePresenceHook,
    shouldRejoin,
    shouldRedirectToResults,
    shouldRedirectToLobby,
    shouldMarkOfflineForPriorRound,
  };
}

/** Resolve lobby auto-join and non-opt-in redirect for rematch waiting. */
export function resolveLobbyScreenActions(ctx: LobbyScreenContext): LobbyScreenActions {
  const { session, myUid, justOptedIn } = ctx;

  if (session.status === 'playing') {
    if (isActiveLivePlayer(session, myUid)) {
      return {
        shouldNavigateToPlay: true,
        shouldAutoJoinLiveRound: false,
        shouldRedirectNonOptInViewer: false,
        shouldReconcileRematchWaitingPresence: false,
      };
    }
    const player = session.players[myUid];
    const shouldAutoJoinLiveRound =
      isLiveParticipant(session, myUid) &&
      Boolean(player && (player.online !== true || player.hasLeft === true));
    return {
      shouldNavigateToPlay: false,
      shouldAutoJoinLiveRound,
      shouldRedirectNonOptInViewer: false,
      shouldReconcileRematchWaitingPresence: false,
    };
  }

  if (session.status === 'waiting' && isRematchWaitingLobby(session)) {
    const player = session.players[myUid];
    const optedIn = isRematchWaitingLobbyOptedIn(session, myUid) || justOptedIn === true;
    return {
      shouldNavigateToPlay: false,
      shouldAutoJoinLiveRound: false,
      shouldRedirectNonOptInViewer: !optedIn,
      shouldReconcileRematchWaitingPresence: optedIn && player != null && player.online !== true,
    };
  }

  return {
    shouldNavigateToPlay: false,
    shouldAutoJoinLiveRound: false,
    shouldRedirectNonOptInViewer: false,
    shouldReconcileRematchWaitingPresence: false,
  };
}

/** Whether results screen should call `markPlayerOffline` for the viewer. */
export function resolveResultsPresence(ctx: ResultsPresenceContext): boolean {
  const { liveSession, frozenBaseWordRound } = ctx;
  if (!liveSession) {
    return frozenBaseWordRound != null;
  }
  const liveRound = liveSession.baseWordRound ?? 0;
  if (frozenBaseWordRound != null && frozenBaseWordRound < liveRound) {
    return true;
  }
  if (liveSession.status === 'playing') {
    return false;
  }
  if (liveSession.status !== 'finished') {
    return false;
  }
  if (frozenBaseWordRound == null) {
    return true;
  }
  return liveRound <= frozenBaseWordRound;
}
