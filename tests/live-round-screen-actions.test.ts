import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import {
  isLiveRoundStarted,
  resolveLobbyScreenActions,
  resolvePlayScreenActions,
  resolveResultsPresence,
} from '../lib/online/live-round-screen-actions.js';

const settings: GameSession['settings'] = {
  durationSeconds: 300,
  uniqueBonusEnabled: false,
  language: 'uk',
  allowProperNouns: false,
  allowSlang: false,
};

function playingSession(
  players: GameSession['players'],
  extra: Partial<GameSession> = {},
): GameSession {
  return {
    baseWord: 'тест',
    status: 'playing',
    baseWordRound: 1,
    liveRoundPlayerUids: ['org', 'p2'],
    settings,
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    players,
    ...extra,
  };
}

describe('resolvePlayScreenActions', () => {
  it('enables presence for active live-round participants', () => {
    const session = playingSession({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
    });
    expect(
      resolvePlayScreenActions({
        session,
        myUid: 'org',
        roundEnded: false,
        frozenBaseWordRound: null,
        leavingIntentionally: false,
      }).enablePresenceHook,
    ).toBe(true);
  });

  it('blocks rejoin while reviewing a prior round', () => {
    const session = playingSession({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      p3: { name: 'Three', wordCount: 8, score: 8, online: false },
    });
    const actions = resolvePlayScreenActions({
      session: { ...session, liveRoundPlayerUids: ['org'] },
      myUid: 'p3',
      roundEnded: true,
      frozenBaseWordRound: 0,
      leavingIntentionally: false,
    });
    expect(actions.shouldRejoin).toBe(false);
    expect(actions.enablePresenceHook).toBe(false);
  });

  it('does not redirect to lobby while frozen on a prior round', () => {
    const session = playingSession(
      { org: { name: 'Org', wordCount: 0, score: 0, online: true } },
      { status: 'waiting' },
    );
    expect(
      resolvePlayScreenActions({
        session,
        myUid: 'org',
        roundEnded: true,
        frozenBaseWordRound: 0,
        leavingIntentionally: false,
      }).shouldRedirectToLobby,
    ).toBe(false);
  });

  it('does not redirect to lobby when timer is live but status cache lags waiting', () => {
    const session = playingSession(
      { org: { name: 'Org', wordCount: 0, score: 0, online: true } },
      { status: 'waiting', timerEndsAt: Date.now() + 60_000 },
    );
    expect(
      resolvePlayScreenActions({
        session,
        myUid: 'org',
        roundEnded: false,
        frozenBaseWordRound: null,
        leavingIntentionally: false,
      }).shouldRedirectToLobby,
    ).toBe(false);
  });

  it('requests rejoin when live-round player is offline without hasLeft', () => {
    const session = playingSession({
      org: { name: 'Org', wordCount: 0, score: 0, online: false },
      p2: { name: 'P2', wordCount: 0, score: 0, online: true },
    });
    expect(
      resolvePlayScreenActions({
        session,
        myUid: 'org',
        roundEnded: false,
        frozenBaseWordRound: null,
        leavingIntentionally: false,
      }).shouldRejoin,
    ).toBe(true);
  });

  it('does not request rejoin after voluntary leave', () => {
    const session = playingSession({
      org: { name: 'Org', wordCount: 0, score: 0, online: false, hasLeft: true },
      p2: { name: 'P2', wordCount: 0, score: 0, online: true },
    });
    expect(
      resolvePlayScreenActions({
        session,
        myUid: 'org',
        roundEnded: false,
        frozenBaseWordRound: null,
        leavingIntentionally: false,
      }).shouldRejoin,
    ).toBe(false);
  });
});

describe('resolveLobbyScreenActions', () => {
  it('auto-joins opted-in player when timer is live but they missed liveRoundPlayerUids', () => {
    const session: GameSession = {
      baseWord: 'тест',
      status: 'waiting',
      baseWordRound: 1,
      liveRoundPlayerUids: ['p1'],
      settings,
      timerEndsAt: Date.now() + 60_000,
      organizerId: 'org',
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p1: { name: 'One', wordCount: 0, score: 0, online: true },
      },
    };
    expect(isLiveRoundStarted(session)).toBe(true);
    const actions = resolveLobbyScreenActions({ session, myUid: 'org' });
    expect(actions.shouldNavigateToPlay).toBe(false);
    expect(actions.shouldAutoJoinLiveRound).toBe(true);
  });

  it('does not auto-join non-opt-in organizer who missed the live roster', () => {
    const session: GameSession = {
      baseWord: 'тест',
      status: 'playing',
      baseWordRound: 1,
      liveRoundPlayerUids: ['p1'],
      settings,
      timerEndsAt: Date.now() + 60_000,
      organizerId: 'org',
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: false },
        p1: { name: 'One', wordCount: 0, score: 0, online: true },
      },
    };
    const actions = resolveLobbyScreenActions({ session, myUid: 'org' });
    expect(actions.shouldAutoJoinLiveRound).toBe(false);
  });

  it('redirects non-opt-in viewers away from rematch waiting lobby', () => {
    const session: GameSession = {
      baseWord: 'тест',
      status: 'waiting',
      baseWordRound: 1,
      settings,
      timerEndsAt: null,
      organizerId: 'org',
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p3: { name: 'Three', wordCount: 0, score: 0, online: false },
      },
    };
    expect(resolveLobbyScreenActions({ session, myUid: 'p3' }).shouldRedirectNonOptInViewer).toBe(
      true,
    );
  });

  it('keeps viewer who just pressed «Грати ще» (resultsExitedBy) in rematch lobby', () => {
    const session: GameSession = {
      baseWord: 'тест',
      status: 'waiting',
      baseWordRound: 1,
      settings,
      timerEndsAt: null,
      organizerId: 'org',
      resultsExitedBy: { p2: true },
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: false },
      },
    };
    const actions = resolveLobbyScreenActions({ session, myUid: 'p2' });
    expect(actions.shouldRedirectNonOptInViewer).toBe(false);
    expect(actions.shouldReconcileRematchWaitingPresence).toBe(true);
  });

  it('honours justOptedIn navigation flag while RTDB presence is stale', () => {
    const session: GameSession = {
      baseWord: 'тест',
      status: 'waiting',
      baseWordRound: 1,
      settings,
      timerEndsAt: null,
      organizerId: 'org',
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: false },
      },
    };
    const actions = resolveLobbyScreenActions({ session, myUid: 'p2', justOptedIn: true });
    expect(actions.shouldRedirectNonOptInViewer).toBe(false);
    expect(actions.shouldReconcileRematchWaitingPresence).toBe(true);
  });

  it('keeps latched rematch opt-in when online briefly drops (peer join race)', () => {
    const session: GameSession = {
      baseWord: '',
      status: 'waiting',
      baseWordRound: 3,
      settings,
      timerEndsAt: null,
      organizerId: 'org',
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: false },
        p1: { name: 'One', wordCount: 0, score: 0, online: true },
      },
    };
    const actions = resolveLobbyScreenActions({
      session,
      myUid: 'org',
      rematchOptInLatched: true,
    });
    expect(actions.shouldRedirectNonOptInViewer).toBe(false);
    expect(actions.shouldReconcileRematchWaitingPresence).toBe(true);
  });
});

describe('resolveResultsPresence', () => {
  it('marks offline when viewing an older frozen round during live play', () => {
    expect(
      resolveResultsPresence({
        liveSession: { status: 'playing', baseWordRound: 2 },
        frozenBaseWordRound: 1,
      }),
    ).toBe(true);
  });
});
