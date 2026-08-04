import { describe, expect, it } from 'vitest';

import { DEFAULT_SESSION_SETTINGS } from './helpers/game-session-fixtures.js';
import {
  applyWordPlayersChildSnapshot,
  EMPTY_SESSION_WORD_MAPS,
  globalWordCount,
  mergeSessionWithWordMaps,
  removeWordPlayersChild,
  sessionWordMapsFromSession,
  stripWordMapsFromSession,
} from '../lib/firebase/session-word-maps.js';
import { wordsByPlayerFromWordPlayers } from '../lib/online/word-players-invert.js';
import { wordPlayersLeafCount } from '../lib/online/session/live-words-snapshot.js';

describe('session-word-maps helpers', () => {
  it('counts only true leaves for a normalized word', () => {
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
    expect(
      globalWordCount(
        {
          порт: { org: true, ghost: false as unknown as true, peer: true },
        },
        'порт',
      ),
    ).toBe(2);
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

  describe('wordPlayers child merge', () => {
    it('adds a word with true-only peer leaves', () => {
      const next = applyWordPlayersChildSnapshot({}, 'порт', {
        org: true,
        guest: false,
        peer: true,
      });
      expect(next).toEqual({ порт: { org: true, peer: true } });
    });

    it('replaces peers when a word child changes', () => {
      const prev = { порт: { org: true } };
      const next = applyWordPlayersChildSnapshot(prev, 'порт', {
        org: true,
        guest: true,
      });
      expect(next).toEqual({ порт: { org: true, guest: true } });
      expect(next).not.toBe(prev);
    });

    it('removes a word key and is a no-op when missing', () => {
      const prev = { порт: { org: true }, ретро: { guest: true } };
      expect(removeWordPlayersChild(prev, 'порт')).toEqual({
        ретро: { guest: true },
      });
      expect(removeWordPlayersChild(prev, 'немає')).toBe(prev);
    });

    it('deletes the word when raw players are null or not an object', () => {
      const prev = { порт: { org: true } };
      expect(applyWordPlayersChildSnapshot(prev, 'порт', null)).toEqual({});
      expect(applyWordPlayersChildSnapshot(prev, 'порт', 'x')).toEqual({});
    });

    it('deletes the word when raw players are {} or only non-true leaves', () => {
      const prev = { порт: { org: true }, ретро: { guest: true } };
      expect(applyWordPlayersChildSnapshot(prev, 'порт', {})).toEqual({
        ретро: { guest: true },
      });
      expect(applyWordPlayersChildSnapshot(prev, 'ретро', { ghost: false })).toEqual({
        порт: { org: true },
      });
    });

    it('keeps invert lists and leaf counts aligned after two-word merge', () => {
      let wordPlayers = applyWordPlayersChildSnapshot({}, 'порт', { org: true });
      wordPlayers = applyWordPlayersChildSnapshot(wordPlayers, 'ретро', {
        org: true,
        guest: true,
      });
      expect(wordPlayersLeafCount(wordPlayers)).toBe(3);
      expect(wordsByPlayerFromWordPlayers(wordPlayers).get('org')?.sort()).toEqual([
        'порт',
        'ретро',
      ]);
      expect(wordsByPlayerFromWordPlayers(wordPlayers).get('guest')).toEqual(['ретро']);
      expect(globalWordCount(wordPlayers, 'ретро')).toBe(2);
    });
  });
});
