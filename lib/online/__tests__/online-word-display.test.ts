import { describe, expect, it } from 'vitest';

import { buildOnlineWordListDisplay, resolveOnlineWordEntry } from '../online-word-display.js';
import type { GameSession } from '../../firebase/types.js';

function session(overrides: Partial<GameSession> = {}): GameSession {
  return {
    baseWord: 'тест',
    status: 'playing',
    settings: {
      durationSeconds: 600,
      uniqueBonusEnabled: false,
      language: 'uk-uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    players: {},
    ...overrides,
  };
}

describe('resolveOnlineWordEntry', () => {
  it('returns unique when only one player has the word', () => {
    const s = session({ wordPlayers: { слово: { org: true } } });
    expect(resolveOnlineWordEntry('слово', s).kind).toBe('unique');
  });

  it('returns normal with +1 when two players share', () => {
    const s = session({
      wordPlayers: { слово: { org: true, a: true } },
      settings: session().settings,
    });
    const entry = resolveOnlineWordEntry('слово', s);
    expect(entry.kind).toBe('normal');
    expect(entry.badge).toBe('+1');
  });

  it('returns x2 when unique and bonus enabled for 3+ roster', () => {
    const s = session({
      wordPlayers: { слово: { org: true } },
      settings: { ...session().settings, uniqueBonusMode: 'auto' },
      players: {
        org: { name: 'Орг', wordCount: 0, score: 0, avatarColorIndex: 0 },
        a: { name: 'А', wordCount: 0, score: 0, avatarColorIndex: 1 },
        b: { name: 'Б', wordCount: 0, score: 0, avatarColorIndex: 2 },
      },
    });
    const entry = resolveOnlineWordEntry('слово', s);
    expect(entry.badge).toBe('x2');
    expect(entry.points).toBe(2);
  });
});

describe('buildOnlineWordListDisplay', () => {
  it('builds entries from stored words and session counts', () => {
    const s = session({ wordPlayers: { слово: { org: true } } });
    const myWords = new Map([['слово', { display: 'СЛОВО', at: 1 }]]);
    const { entries, displays } = buildOnlineWordListDisplay(myWords, s, 'org');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('unique');
    expect(displays).toEqual(['СЛОВО']);
  });

  it('includes overlap peers for shared words', () => {
    const s = session({
      wordPlayers: { рот: { org: true, a: true } },
      players: {
        org: { name: 'Орг', wordCount: 1, score: 1, avatarColorIndex: 0 },
        a: { name: 'Аня', wordCount: 1, score: 1, avatarColorIndex: 1 },
      },
    });
    const myWords = new Map([['рот', { display: 'РОТ', at: 1 }]]);
    const { entries } = buildOnlineWordListDisplay(myWords, s, 'org');
    expect(entries[0]?.overlapPeers).toEqual([{ playerId: 'a', name: 'Аня', avatarColorIndex: 1 }]);
  });
});
