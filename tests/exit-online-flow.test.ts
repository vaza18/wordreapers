import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateHomeClearingStack = vi.fn();
const cacheActiveRoundProgress = vi.fn();
const runExitCleanupMocks = {
  persistLocalArchive: vi.fn(),
  markResultsExitedAndOffline: vi.fn(),
  markPlayerOffline: vi.fn(),
  organizerLeaveWaitingLobby: vi.fn(),
  abandonWaitingGameSession: vi.fn(),
  leaveGameSession: vi.fn(),
  abandonTrackedOrganizerWaitingRoom: vi.fn(),
  setOrganizerWaitingRoom: vi.fn(),
};

vi.mock('@/lib/navigation/navigate-home', () => ({
  navigateHomeClearingStack: () => navigateHomeClearingStack(),
}));

vi.mock('../lib/firebase/game-session-service.js', () => ({
  beginVoluntaryLeave: vi.fn(),
  endVoluntaryLeave: vi.fn(),
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

vi.mock('../lib/online/coordinated-session-cleanup.js', () => ({
  persistLocalArchive: (...args: unknown[]) => runExitCleanupMocks.persistLocalArchive(...args),
  markResultsExitedAndOffline: (...args: unknown[]) =>
    runExitCleanupMocks.markResultsExitedAndOffline(...args),
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
  get: vi.fn().mockResolvedValue({ exists: () => false }),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

import { exitOnlineToHome } from '../lib/online/exit-online-flow.js';
import { DEFAULT_SESSION_SETTINGS, finishedSession } from './helpers/game-session-fixtures.js';

describe('exitOnlineToHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(runExitCleanupMocks)) {
      fn.mockResolvedValue(undefined);
    }
    cacheActiveRoundProgress.mockResolvedValue(undefined);
  });

  it('caches active round progress before navigating home', async () => {
    const session = {
      ...finishedSession(),
      status: 'playing' as const,
      timerEndsAt: Date.now() + 60_000,
    };
    const myWords = new Map([['порт', { display: 'порт', at: 100 }]]);

    await exitOnlineToHome({
      gameId: 'ABCD',
      uid: 'org',
      isOrganizer: true,
      sessionStatus: 'playing',
      session,
      myWords,
    });

    expect(cacheActiveRoundProgress).toHaveBeenCalledWith('ABCD', 'org', session, myWords);
    expect(navigateHomeClearingStack).toHaveBeenCalled();
  });

  it('awaits waiting-room cleanup before navigation', async () => {
    await exitOnlineToHome({
      gameId: 'ABCD',
      uid: 'guest',
      isOrganizer: false,
      sessionStatus: 'waiting',
    });

    expect(runExitCleanupMocks.leaveGameSession).toHaveBeenCalledWith('ABCD', 'guest');
    expect(navigateHomeClearingStack).toHaveBeenCalled();
  });

  it('archives finished results when exiting from the results screen', async () => {
    const session = finishedSession();
    const words = new Map([['org', new Map([['порт', { display: 'порт', at: 1 }]])]]);

    await exitOnlineToHome({
      gameId: 'ABCD',
      uid: 'org',
      isOrganizer: true,
      sessionStatus: 'finished',
      session,
      wordsForArchive: words,
      exitedResults: true,
    });

    expect(runExitCleanupMocks.persistLocalArchive).toHaveBeenCalled();
    expect(runExitCleanupMocks.markResultsExitedAndOffline).toHaveBeenCalled();
  });

  it('clears organizer waiting-room tracking on exit', async () => {
    await exitOnlineToHome({
      gameId: 'ABCD',
      uid: 'org-1',
      isOrganizer: true,
      sessionStatus: 'waiting',
      session: {
        baseWord: 'тест',
        status: 'waiting',
        settings: DEFAULT_SESSION_SETTINGS,
        timerEndsAt: null,
        organizerId: 'org-1',
        players: {
          'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
        },
      },
    });

    expect(runExitCleanupMocks.abandonTrackedOrganizerWaitingRoom).toHaveBeenCalledWith('org-1');
    expect(runExitCleanupMocks.setOrganizerWaitingRoom).toHaveBeenCalledWith(null);
  });
});
