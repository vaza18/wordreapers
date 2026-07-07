import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

vi.mock('../lib/firebase/auth.js', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue({ uid: 'org-1' }),
}));

import {
  fetchSessionPlayerWords,
  storedWordsToScoredEntries,
} from '../lib/firebase/player-words-service.js';
import { DEFAULT_SESSION_SETTINGS } from './helpers/game-session-fixtures.js';

describe('player-words-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches per-player word maps for the requested roster', async () => {
    getMock
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          порт: { display: 'порт', at: 100 },
        }),
      })
      .mockResolvedValueOnce({ exists: () => false });

    const byPlayer = await fetchSessionPlayerWords('ABCD', ['org-1', 'guest-1']);

    expect(byPlayer.get('org-1')?.get('порт')).toEqual({ display: 'порт', at: 100 });
    expect(byPlayer.get('guest-1')?.size).toBe(0);
  });

  it('scores stored words using session word overlap maps', () => {
    const words = new Map([
      ['порт', { display: 'порт', at: 100 }],
      ['ретро', { display: 'ретро', at: 200 }],
    ]);
    const session = {
      baseWord: 'портрет',
      status: 'finished' as const,
      settings: { ...DEFAULT_SESSION_SETTINGS, uniqueBonusEnabled: true },
      timerEndsAt: null,
      organizerId: 'org',
      players: {
        org: { name: 'Org', wordCount: 2, score: 10, online: false },
      },
      wordPlayers: {
        порт: { org: true },
        ретро: { org: true, guest: true },
      },
    };

    const { entries, displays } = storedWordsToScoredEntries(words, session, true);

    expect(displays).toEqual(['порт', 'ретро']);
    expect(entries[0]?.kind).toBe('unique');
    expect(entries[1]?.kind).toBe('normal');
  });
});
