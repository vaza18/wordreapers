import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', async () => {
  const { asyncStorageMockFactory } = await import('./helpers/mock-async-storage.js');
  return asyncStorageMockFactory();
});

import { resetAsyncStorageMock } from './helpers/mock-async-storage.js';
import { getFinishedRoundArchive } from '../lib/online/online-session-archive.js';
import { saveSoloFinishedRoundArchive } from '../lib/online/solo-round-archive.js';

describe('saveSoloFinishedRoundArchive', () => {
  beforeEach(() => {
    resetAsyncStorageMock();
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
