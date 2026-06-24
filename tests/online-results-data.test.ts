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
      ['p2', new Map([['тор', { ...storedWord('ТОР'), at: 20 }]])],
    ]);

    const view = buildOnlineResultsView(t, session(), byPlayer);
    expect(view.baseWordDisplay).toBe('ПОРТ');
    expect(view.roundDurationSeconds).toBe(600);
    expect(view.playerRankGroups[0]?.players[0]?.wordsPerMinute).toBe(0.1);
    expect(view.globalWords).toHaveLength(2);
    expect(view.playerRankGroups[0]?.players[0]?.playerName).toBe('Аня');
  });

  it('shows pseudonyms in finished public rooms', () => {
    const byPlayer = new Map([
      ['p1', new Map([['пер', storedWord('ПЕР')]])],
      ['p2', new Map()],
    ]);
    const view = buildOnlineResultsView(
      t,
      {
        ...session(),
        isPublic: false,
        identityMasked: true,
        players: {
          p1: {
            name: 'iPhone 13 Pro Max',
            publicAlias: 'Гравець 1',
            wordCount: 1,
            score: 1,
            avatarColorIndex: 0,
          },
          p2: {
            name: 'iPad Pro 13',
            publicAlias: 'Гравець 2',
            wordCount: 0,
            score: 0,
            avatarColorIndex: 1,
          },
        },
      },
      byPlayer,
      { viewerUid: 'p2' },
    );
    expect(view.playerRankGroups[0]?.players[0]?.playerName).toBe('Гравець 1');
    expect(view.globalWords[0]?.authors[0]?.playerName).toBe('Гравець 1');
  });
});
