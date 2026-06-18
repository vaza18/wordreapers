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
    wordCounts: {},
    ...overrides,
  };
}

describe('resolveOnlineWordEntry', () => {
  it('returns unique when only one player has the word', () => {
    const s = session({ wordCounts: { слово: 1 } });
    expect(resolveOnlineWordEntry('слово', s).kind).toBe('unique');
  });

  it('returns normal with +1 when two players share', () => {
    const s = session({ wordCounts: { слово: 2 }, settings: session().settings });
    const entry = resolveOnlineWordEntry('слово', s);
    expect(entry.kind).toBe('normal');
    expect(entry.badge).toBe('+1');
  });

  it('returns x2 when unique and bonus enabled', () => {
    const s = session({
      wordCounts: { слово: 1 },
      settings: { ...session().settings, uniqueBonusEnabled: true },
    });
    const entry = resolveOnlineWordEntry('слово', s);
    expect(entry.badge).toBe('x2');
    expect(entry.points).toBe(2);
  });
});

describe('buildOnlineWordListDisplay', () => {
  it('builds entries from stored words and session counts', () => {
    const s = session({ wordCounts: { слово: 1 } });
    const myWords = new Map([
      ['слово', { display: 'СЛОВО', kind: 'unique' as const, points: 1, badge: null, at: 1 }],
    ]);
    const { entries, displays } = buildOnlineWordListDisplay(myWords, s, 'org');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('unique');
    expect(displays).toEqual(['СЛОВО']);
  });

  it('includes overlap peers for shared words', () => {
    const s = session({
      wordCounts: { рот: 2 },
      wordPlayers: { рот: { org: true, a: true } },
      players: {
        org: { name: 'Орг', wordCount: 1, score: 1, avatarColorIndex: 0 },
        a: { name: 'Аня', wordCount: 1, score: 1, avatarColorIndex: 1 },
      },
    });
    const myWords = new Map([
      ['рот', { display: 'РОТ', kind: 'normal' as const, points: 1, badge: '+1', at: 1 }],
    ]);
    const { entries } = buildOnlineWordListDisplay(myWords, s, 'org');
    expect(entries[0]?.overlapPeers).toEqual([{ playerId: 'a', name: 'Аня', avatarColorIndex: 1 }]);
  });
});
