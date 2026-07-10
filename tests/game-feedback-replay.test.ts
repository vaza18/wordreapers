import { describe, expect, it, vi } from 'vitest';

import { replayFromStart } from '../lib/feedback/replay-from-start.js';

describe('replayFromStart', () => {
  it('awaits seekTo(0) before play so finished clips can restart', async () => {
    const order: string[] = [];
    let resolveSeek!: () => void;
    const player = {
      seekTo: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            order.push('seek-start');
            resolveSeek = () => {
              order.push('seek-done');
              resolve();
            };
          }),
      ),
      play: vi.fn(() => {
        order.push('play');
      }),
    };

    const replayPromise = replayFromStart(player);
    expect(order).toEqual(['seek-start']);
    expect(player.play).not.toHaveBeenCalled();

    resolveSeek();
    await replayPromise;

    expect(order).toEqual(['seek-start', 'seek-done', 'play']);
    expect(player.seekTo).toHaveBeenCalledWith(0);
  });

  it('does not call play when seekTo rejects', async () => {
    const player = {
      seekTo: vi.fn(() => Promise.reject(new Error('seek failed'))),
      play: vi.fn(),
    };

    await expect(replayFromStart(player)).rejects.toThrow('seek failed');
    expect(player.play).not.toHaveBeenCalled();
  });
});
