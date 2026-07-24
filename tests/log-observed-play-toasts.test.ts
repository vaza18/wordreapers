import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logObservedPlayToastEvents } from '../lib/debug/log-observed-play-toasts.js';
import type { PlayToastEvent } from '../lib/online/play-toast-events.js';

describe('logObservedPlayToastEvents', () => {
  const originalEnv = process.env.EXPO_PUBLIC_LOG_LEVEL;

  beforeEach(() => {
    vi.stubGlobal('__DEV__', true);
    delete process.env.EXPO_PUBLIC_LOG_LEVEL;
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.EXPO_PUBLIC_LOG_LEVEL;
    } else {
      process.env.EXPO_PUBLIC_LOG_LEVEL = originalEnv;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is silent at event level', () => {
    process.env.EXPO_PUBLIC_LOG_LEVEL = 'event';
    const events: PlayToastEvent[] = [
      { type: 'player_joined', playerId: 'p2', name: 'Guest', gender: 'f' },
    ];
    logObservedPlayToastEvents(events, 'L8NN5', 0);
    expect(console.log).not.toHaveBeenCalled();
  });

  it('logs remote join at detail level', () => {
    process.env.EXPO_PUBLIC_LOG_LEVEL = 'detail';
    const events: PlayToastEvent[] = [
      { type: 'player_joined', playerId: 'p2', name: 'Guest', gender: 'f' },
    ];
    logObservedPlayToastEvents(events, 'L8NN5', 0);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[Guest] joined the round (observed) (L8NN5, round 0)'),
    );
  });
});
