import { beforeEach, describe, expect, it, vi } from 'vitest';

const rejoinExistingPlayer = vi.fn();
const markResultsExited = vi.fn();
let appState: string = 'active';

vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return appState;
    },
  },
}));

vi.mock('../lib/firebase/game-session-service.js', () => ({
  rejoinExistingPlayer: (...args: unknown[]) => rejoinExistingPlayer(...args),
}));

vi.mock('../lib/firebase/results-coordination-service.js', () => ({
  markResultsExited: (...args: unknown[]) => markResultsExited(...args),
}));

import { reconcilePlayerPresence } from '../lib/online/presence/reconcile-player-presence.js';

const profile = { name: 'Player', avatarColorIndex: 1, gender: 'm' as const };

describe('reconcilePlayerPresence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appState = 'active';
    rejoinExistingPlayer.mockResolvedValue(undefined);
    markResultsExited.mockResolvedValue(undefined);
  });

  it('latches rematch opt-in then rejoins (online presence included in rejoin)', async () => {
    await reconcilePlayerPresence('ABCDE', 'uid-1', profile);

    expect(markResultsExited).toHaveBeenCalledWith('ABCDE', 'uid-1');
    expect(rejoinExistingPlayer).toHaveBeenCalledWith('ABCDE', 'uid-1', profile);
    expect(markResultsExited.mock.invocationCallOrder[0]).toBeLessThan(
      rejoinExistingPlayer.mock.invocationCallOrder[0]!,
    );
  });

  it('still writes rematch latch while backgrounded, but does not rejoin online', async () => {
    appState = 'background';

    await reconcilePlayerPresence('ABCDE', 'uid-1', profile);

    expect(markResultsExited).toHaveBeenCalledWith('ABCDE', 'uid-1');
    expect(rejoinExistingPlayer).not.toHaveBeenCalled();
  });

  it('still writes rematch latch while inactive (multi-sim lock), but does not rejoin online', async () => {
    appState = 'inactive';

    await reconcilePlayerPresence('ABCDE', 'uid-1', profile);

    expect(markResultsExited).toHaveBeenCalledWith('ABCDE', 'uid-1');
    expect(rejoinExistingPlayer).not.toHaveBeenCalled();
  });
});
