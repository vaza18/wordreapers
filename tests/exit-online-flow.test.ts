import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateHomeClearingStack = vi.fn();
const cacheActiveRoundProgress = vi.fn();
const beginVoluntaryLeave = vi.fn();
const endVoluntaryLeave = vi.fn();
const getMock = vi.fn();
const runExitCleanupMocks = {
  persistLocalArchive: vi.fn(),
  markResultsExitedAndOffline: vi.fn(),
  markPlayerOffline: vi.fn(),
  organizerLeaveWaitingLobby: vi.fn(),
  abandonWaitingGameSession: vi.fn(),
  leaveGameSession: vi.fn(),
  abandonTrackedOrganizerWaitingRoom: vi.fn(),
  setOrganizerWaitingRoom: vi.fn(),
  markPendingRoundArchive: vi.fn(),
};

vi.mock('@/lib/navigation/navigate-home', () => ({
  navigateHomeClearingStack: () => navigateHomeClearingStack(),
}));

vi.mock('../lib/firebase/game-session-service.js', () => ({
  beginVoluntaryLeave: (...args: unknown[]) => beginVoluntaryLeave(...args),
  endVoluntaryLeave: (...args: unknown[]) => endVoluntaryLeave(...args),
  markPlayerOffline: (...args: unknown[]) => runExitCleanupMocks.markPlayerOffline(...args),
  organizerLeaveWaitingLobby: (...args: unknown[]) =>
    runExitCleanupMocks.organizerLeaveWaitingLobby(...args),
  abandonWaitingGameSession: (...args: unknown[]) =>
    runExitCleanupMocks.abandonWaitingGameSession(...args),
  leaveGameSession: (...args: unknown[]) => runExitCleanupMocks.leaveGameSession(...args),
}));

vi.mock('../lib/online/session/cache-active-round.js', () => ({
  cacheActiveRoundProgress: (...args: unknown[]) => cacheActiveRoundProgress(...args),
}));

vi.mock('../lib/online/session/paused-online-resume.js', () => ({
  clearPausedOnlineResume: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/online/session/left-online-resume.js', () => ({
  clearLeftOnlineResume: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/online/coordinated-session-cleanup.js', () => ({
  persistLocalArchive: (...args: unknown[]) => runExitCleanupMocks.persistLocalArchive(...args),
  markResultsExitedAndOffline: (...args: unknown[]) =>
    runExitCleanupMocks.markResultsExitedAndOffline(...args),
}));

vi.mock('../lib/online/session/pending-round-archive.js', () => ({
  markPendingRoundArchive: (...args: unknown[]) =>
    runExitCleanupMocks.markPendingRoundArchive(...args),
}));

vi.mock('../lib/online/abandon-tracked-waiting-room.js', () => ({
  abandonTrackedOrganizerWaitingRoom: (...args: unknown[]) =>
    runExitCleanupMocks.abandonTrackedOrganizerWaitingRoom(...args),
}));

vi.mock('../lib/online/organizer-waiting-room.js', () => ({
  setOrganizerWaitingRoom: (...args: unknown[]) =>
    runExitCleanupMocks.setOrganizerWaitingRoom(...args),
}));

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

import { exitOnlineSession, exitOnlineToHome } from '../lib/online/exit-online-flow.js';
import { DEFAULT_SESSION_SETTINGS, finishedSession } from './helpers/game-session-fixtures.js';

describe('exitOnlineToHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(runExitCleanupMocks)) {
      fn.mockResolvedValue(undefined);
    }
    runExitCleanupMocks.persistLocalArchive.mockResolvedValue('saved');
    cacheActiveRoundProgress.mockResolvedValue(undefined);
    getMock.mockResolvedValue({ exists: () => false });
  });

  it('caches active round progress before navigating home', async () => {
    const session = {
      ...finishedSession(),
      status: 'playing' as const,
      timerEndsAt: Date.now() + 60_000,
    };

    await exitOnlineToHome({
      gameId: 'ABCDE',
      uid: 'org',
      isOrganizer: true,
      sessionStatus: 'playing',
      session,
      myWords: ['порт'],
    });

    expect(cacheActiveRoundProgress).toHaveBeenCalledWith('ABCDE', 'org', session, ['порт']);
    expect(navigateHomeClearingStack).toHaveBeenCalled();
  });

  it('defaults myWords to empty array when omitted on playing exit', async () => {
    const session = {
      ...finishedSession(),
      status: 'playing' as const,
      timerEndsAt: Date.now() + 60_000,
    };

    await exitOnlineToHome({
      gameId: 'ABCDE',
      uid: 'org',
      isOrganizer: true,
      sessionStatus: 'playing',
      session,
    });

    expect(cacheActiveRoundProgress).toHaveBeenCalledWith('ABCDE', 'org', session, []);
  });

  it('awaits waiting-room cleanup before navigation', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        ...finishedSession(),
        status: 'waiting',
        organizerId: 'org',
        players: {
          org: { name: 'Org', wordCount: 0, score: 0, online: true },
          guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
        },
      }),
    });

    await exitOnlineToHome({
      gameId: 'ABCDE',
      uid: 'guest',
      isOrganizer: false,
      sessionStatus: 'waiting',
    });

    expect(beginVoluntaryLeave).toHaveBeenCalledWith('ABCDE', 'guest');
    expect(runExitCleanupMocks.leaveGameSession).toHaveBeenCalledWith('ABCDE', 'guest');
    expect(endVoluntaryLeave).toHaveBeenCalledWith('ABCDE', 'guest');
    expect(navigateHomeClearingStack).toHaveBeenCalled();
  });

  it('leaves rematch waiting when results UI is still frozen finished', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({
        ...finishedSession(),
        status: 'waiting',
        baseWordRound: 1,
        organizerId: 'org',
        resultsExitedBy: { org: true },
        players: {
          org: { name: 'Org', wordCount: 0, score: 0, online: true },
          guest: { name: 'Guest', wordCount: 0, score: 0, online: false },
        },
      }),
    });

    await exitOnlineToHome({
      gameId: 'ABCDE',
      uid: 'guest',
      isOrganizer: false,
      sessionStatus: 'finished',
      session: finishedSession(),
      exitedResults: true,
    });

    expect(beginVoluntaryLeave).toHaveBeenCalledWith('ABCDE', 'guest');
    expect(runExitCleanupMocks.leaveGameSession).toHaveBeenCalledWith('ABCDE', 'guest');
    expect(runExitCleanupMocks.markResultsExitedAndOffline).not.toHaveBeenCalled();
    expect(endVoluntaryLeave).toHaveBeenCalledWith('ABCDE', 'guest');
    expect(navigateHomeClearingStack).toHaveBeenCalled();
  });

  it('archives finished results when exiting from the results screen', async () => {
    const session = finishedSession();
    const words = new Map([['org', ['порт']]]);
    getMock.mockResolvedValue({ exists: () => true, val: () => session });

    await exitOnlineToHome({
      gameId: 'ABCDE',
      uid: 'org',
      isOrganizer: true,
      sessionStatus: 'finished',
      session,
      wordsForArchive: words,
      exitedResults: true,
    });

    expect(runExitCleanupMocks.persistLocalArchive).toHaveBeenCalled();
    expect(runExitCleanupMocks.markPendingRoundArchive).not.toHaveBeenCalled();
    expect(runExitCleanupMocks.markResultsExitedAndOffline).toHaveBeenCalled();
  });

  it('marks pending archive when exit soft-skips empty+claims words', async () => {
    const session = finishedSession();
    getMock.mockResolvedValue({ exists: () => true, val: () => session });
    runExitCleanupMocks.persistLocalArchive.mockResolvedValue('skipped_retryable');

    await exitOnlineToHome({
      gameId: 'ABCDE',
      uid: 'org',
      isOrganizer: true,
      sessionStatus: 'finished',
      session,
      wordsForArchive: new Map(),
      exitedResults: true,
    });

    expect(runExitCleanupMocks.markPendingRoundArchive).toHaveBeenCalledWith('ABCDE', 0, 'org');
  });

  it('clears organizer waiting-room tracking on exit', async () => {
    const waiting = {
      baseWord: 'тест',
      status: 'waiting' as const,
      settings: DEFAULT_SESSION_SETTINGS,
      timerEndsAt: null,
      organizerId: 'org-1',
      players: {
        'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
      },
    };
    getMock.mockResolvedValue({ exists: () => true, val: () => waiting });

    await exitOnlineToHome({
      gameId: 'ABCDE',
      uid: 'org-1',
      isOrganizer: true,
      sessionStatus: 'waiting',
      session: waiting,
    });

    expect(runExitCleanupMocks.abandonTrackedOrganizerWaitingRoom).toHaveBeenCalledWith('org-1');
    expect(runExitCleanupMocks.setOrganizerWaitingRoom).toHaveBeenCalledWith(null);
  });
});

describe('exitOnlineSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(runExitCleanupMocks)) {
      fn.mockResolvedValue(undefined);
    }
    runExitCleanupMocks.persistLocalArchive.mockResolvedValue('saved');
    getMock.mockResolvedValue({ exists: () => false });
  });

  it('runs finished-results cleanup without navigating home', async () => {
    const session = finishedSession();
    getMock.mockResolvedValue({ exists: () => true, val: () => session });

    await exitOnlineSession({
      gameId: 'ABCDE',
      uid: 'org',
      isOrganizer: true,
      sessionStatus: 'finished',
      session,
      wordsForArchive: new Map([['org', ['порт']]]),
      exitedResults: true,
    });

    expect(runExitCleanupMocks.persistLocalArchive).toHaveBeenCalled();
    expect(runExitCleanupMocks.markResultsExitedAndOffline).toHaveBeenCalled();
    expect(navigateHomeClearingStack).not.toHaveBeenCalled();
  });
});
