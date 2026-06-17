import { describe, expect, it } from 'vitest';

import type { StoredPlayerWord } from '../lib/firebase/player-words-service.js';
import type { GameSession } from '../lib/firebase/types.js';
import { buildOnlineResultsView, firebaseWordsToMaps } from '../lib/online/online-results-data.js';

const t = (key: string) => key;

function session(): GameSession {
  return {
    baseWord: 'порт',
    status: 'finished',
    settings: {
      durationSeconds: 600,
      uniqueBonusEnabled: false,
      language: 'uk-uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: null,
    organizerId: 'p1',
    players: {
      p1: { name: 'Аня', wordCount: 1, score: 2, avatarColorIndex: 0 },
      p2: { name: 'Богдан', wordCount: 1, score: 1, avatarColorIndex: 1 },
    },
  };
}

function storedWord(display: string): StoredPlayerWord {
  return {
    display,
    kind: 'unique',
    points: 2,
    badge: 'x2',
    at: 10,
  };
}

describe('firebaseWordsToMaps', () => {
  it('sorts words by submission time', () => {
    const byPlayer = new Map([
      [
        'p1',
        new Map([
          ['тор', { ...storedWord('ТОР'), at: 20 }],
          ['рот', { ...storedWord('РОТ'), at: 5 }],
        ]),
      ],
    ]);

    const { wordsByPlayer, displaysByPlayer } = firebaseWordsToMaps(byPlayer);
    expect(wordsByPlayer.get('p1')).toEqual(['рот', 'тор']);
    expect(displaysByPlayer.get('p1')).toEqual(['РОТ', 'ТОР']);
  });
});

describe('buildOnlineResultsView', () => {
  it('builds headline and standings from firebase words', () => {
    const byPlayer = new Map([
      ['p1', new Map([['рот', storedWord('РОТ')]])],
      [
        'p2',
        new Map([
          ['тор', { ...storedWord('ТОР'), kind: 'normal' as const, points: 1, badge: null }],
        ]),
      ],
    ]);

    const view = buildOnlineResultsView(t, session(), byPlayer);
    expect(view.baseWordDisplay).toBe('ПОРТ');
    expect(view.roundDurationSeconds).toBe(600);
    expect(view.playerRankGroups[0]?.players[0]?.wordsPerMinute).toBe(0.1);
    expect(view.globalWords).toHaveLength(2);
    expect(view.playerRankGroups[0]?.players[0]?.playerName).toBe('Аня');
  });
});
