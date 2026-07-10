import { beforeEach, describe, expect, it, vi } from 'vitest';

const rejoinExistingPlayer = vi.fn();
const markPlayerOnline = vi.fn();
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
  markPlayerOnline: (...args: unknown[]) => markPlayerOnline(...args),
}));

import { reconcilePlayerPresence } from '../lib/online/presence/reconcile-player-presence.js';

const profile = { name: 'Player', avatarColorIndex: 1, gender: 'm' as const };

describe('reconcilePlayerPresence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appState = 'active';
    rejoinExistingPlayer.mockResolvedValue(undefined);
    markPlayerOnline.mockResolvedValue(undefined);
  });

  it('rejoins roster membership then marks the player online', async () => {
    await reconcilePlayerPresence('ABCDE', 'uid-1', profile);

    expect(rejoinExistingPlayer).toHaveBeenCalledWith('ABCDE', 'uid-1', profile);
    expect(markPlayerOnline).toHaveBeenCalledWith('ABCDE', 'uid-1');
    expect(rejoinExistingPlayer.mock.invocationCallOrder[0]).toBeLessThan(
      markPlayerOnline.mock.invocationCallOrder[0]!,
    );
  });

  it('skips rejoin while backgrounded so AppState offline is not overwritten', async () => {
    appState = 'background';

    await reconcilePlayerPresence('ABCDE', 'uid-1', profile);

    expect(rejoinExistingPlayer).not.toHaveBeenCalled();
    expect(markPlayerOnline).not.toHaveBeenCalled();
  });
});
