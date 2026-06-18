import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => Promise.resolve(storage.get(key) ?? null),
    setItem: (key: string, value: string) => {
      storage.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string) => {
      storage.delete(key);
      return Promise.resolve();
    },
  },
}));

import { getFinishedRoundArchive } from '../lib/online/online-session-archive.js';
import { saveSoloFinishedRoundArchive } from '../lib/online/solo-round-archive.js';

describe('saveSoloFinishedRoundArchive', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('stores a finished solo round in local history', async () => {
    await saveSoloFinishedRoundArchive(
      'solo1',
      {
        baseWord: 'тест',
        baseWordDisplay: 'ТЕСТ',
        durationMinutes: 5,
        uniqueBonusMode: 'off',
        allowProperNouns: false,
        allowSlang: false,
      },
      [
        {
          normalized: 'тес',
          display: 'ТЕС',
          kind: 'unique',
          points: 2,
          badge: null,
          at: 1,
        },
      ],
      false,
      { name: 'Василь', gender: 'm', avatarColorIndex: 1 },
    );

    const archive = await getFinishedRoundArchive('solo1', 0);
    expect(archive?.session.status).toBe('finished');
    expect(archive?.session.players.solo?.name).toBe('Василь');
    expect(archive?.playerWords.solo?.тес?.display).toBe('ТЕС');
  });
});
