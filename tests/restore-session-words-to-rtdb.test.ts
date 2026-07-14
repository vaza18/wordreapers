import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const setMock = vi.fn();
const writeSessionWordMapsShards = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  set: (...args: unknown[]) => setMock(...args),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

vi.mock('../lib/firebase/session-word-maps-service.js', () => ({
  writeSessionWordMapsShards: (...args: unknown[]) => writeSessionWordMapsShards(...args),
}));

import { restoreSessionWordsToRtdb } from '../lib/online/session/restore-session-words-to-rtdb.js';

describe('restoreSessionWordsToRtdb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMock.mockResolvedValue(undefined);
    writeSessionWordMapsShards.mockResolvedValue(undefined);
  });

  it('writes word maps and per-player word nodes', async () => {
    await restoreSessionWordsToRtdb(
      'abcde',
      {
        wordPlayers: { порт: { 'org-1': true } },
      },
      {
        'org-1': {
          порт: { display: 'порт', at: 100 },
        },
      },
    );

    expect(writeSessionWordMapsShards).toHaveBeenCalledWith('ABCDE', {
      wordPlayers: { порт: { 'org-1': true } },
    });
    expect(setMock).toHaveBeenCalled();
  });

  it('skips empty word map shards and empty player word nodes', async () => {
    await restoreSessionWordsToRtdb(
      'ABCDE',
      { wordPlayers: {} },
      {
        'org-1': {},
      },
    );

    expect(writeSessionWordMapsShards).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
  });
});
