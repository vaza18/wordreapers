import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeSessionWordMapsShards = vi.fn();

vi.mock('../lib/firebase/session-word-maps-service.js', () => ({
  writeSessionWordMapsShards: (...args: unknown[]) => writeSessionWordMapsShards(...args),
}));

import { restoreSessionWordsToRtdb } from '../lib/online/session/restore-session-words-to-rtdb.js';

describe('restoreSessionWordsToRtdb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeSessionWordMapsShards.mockResolvedValue(undefined);
  });

  it('writes word maps shards', async () => {
    await restoreSessionWordsToRtdb('abcde', {
      wordPlayers: { порт: { 'org-1': true } },
    });

    expect(writeSessionWordMapsShards).toHaveBeenCalledWith('ABCDE', {
      wordPlayers: { порт: { 'org-1': true } },
    });
  });

  it('skips empty word map shards', async () => {
    await restoreSessionWordsToRtdb('ABCDE', { wordPlayers: {} });

    expect(writeSessionWordMapsShards).not.toHaveBeenCalled();
  });
});
