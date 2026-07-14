import { describe, expect, it } from 'vitest';

import { DEFAULT_SESSION_SETTINGS } from './helpers/game-session-fixtures.js';
import {
  EMPTY_SESSION_WORD_MAPS,
  globalWordCount,
  mergeSessionWithWordMaps,
  sessionWordMapsFromSession,
  stripWordMapsFromSession,
} from '../lib/firebase/session-word-maps.js';

describe('session-word-maps helpers', () => {
  it('counts players who submitted a normalized word', () => {
    expect(
      globalWordCount(
        {
          порт: { org: true, guest: true },
          ретро: { org: true },
        },
        'порт',
      ),
    ).toBe(2);
    expect(globalWordCount(undefined, 'порт')).toBe(0);
    expect(globalWordCount({}, 'порт')).toBe(0);
  });

  it('strips word map fields from a session copy', () => {
    const session = {
      baseWord: 'тест',
      status: 'playing' as const,
      settings: DEFAULT_SESSION_SETTINGS,
      timerEndsAt: 1,
      organizerId: 'org',
      players: {},
      wordPlayers: { порт: { org: true } },
    };

    const stripped = stripWordMapsFromSession(session);

    expect(stripped).not.toHaveProperty('wordPlayers');
    expect(session.wordPlayers).toEqual({ порт: { org: true } });
  });

  it('returns core unchanged when maps are null', () => {
    const core = {
      id: 'ABCDE',
      baseWord: 'тест',
      status: 'playing' as const,
      settings: DEFAULT_SESSION_SETTINGS,
      timerEndsAt: 1,
      organizerId: 'org',
      players: {},
    };

    expect(mergeSessionWithWordMaps(core, null)).toBe(core);
  });

  it('merges word maps onto a core session', () => {
    const core = {
      id: 'ABCDE',
      baseWord: 'тест',
      status: 'playing' as const,
      settings: DEFAULT_SESSION_SETTINGS,
      timerEndsAt: 1,
      organizerId: 'org',
      players: {},
    };
    const maps = {
      wordPlayers: { порт: { org: true } },
    };

    expect(mergeSessionWithWordMaps(core, maps)).toEqual({
      ...core,
      ...maps,
    });
  });

  it('extracts word maps from a merged session shape', () => {
    expect(
      sessionWordMapsFromSession({
        wordPlayers: { порт: { org: true } },
      }),
    ).toEqual({
      wordPlayers: { порт: { org: true } },
    });
  });

  it('exposes an empty word maps constant', () => {
    expect(EMPTY_SESSION_WORD_MAPS).toEqual({
      wordPlayers: {},
    });
  });
});
