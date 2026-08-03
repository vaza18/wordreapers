import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import {
  buildDisplaysByPlayer,
  buildOnlineResultsView,
} from '../lib/online/online-results-data.js';

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

describe('buildDisplaysByPlayer', () => {
  it('resolves apostrophe displays from lexicon map', () => {
    const wordsByPlayer = new Map([['p1', ['компютер']]]);
    const displays = buildDisplaysByPlayer(wordsByPlayer, new Map([['компютер', "КОМП'ЮТЕР"]]));
    expect(displays.get('p1')).toEqual(["КОМП'ЮТЕР"]);
  });

  it('falls back to uppercase normalized without lexicon', () => {
    const wordsByPlayer = new Map([['p1', ['порт']]]);
    expect(buildDisplaysByPlayer(wordsByPlayer).get('p1')).toEqual(['ПОРТ']);
  });
});

describe('buildOnlineResultsView', () => {
  it('keeps apostrophe when displaysByPlayer comes from lexicon', () => {
    const wordsByPlayer = new Map([
      ['p1', ['компютер']],
      ['p2', []],
    ]);
    const displaysByPlayer = buildDisplaysByPlayer(
      wordsByPlayer,
      new Map([['компютер', "КОМП'ЮТЕР"]]),
    );
    const view = buildOnlineResultsView(t, session(), wordsByPlayer, { displaysByPlayer });
    expect(view.globalWords.find((row) => row.normalized === 'компютер')?.display).toBe(
      "КОМП'ЮТЕР",
    );
    expect(view.playerRankGroups[0]?.players[0]?.words[0]?.display).toBe("КОМП'ЮТЕР");
  });

  it('builds headline and standings from firebase words', () => {
    const wordsByPlayer = new Map([
      ['p1', ['рот']],
      ['p2', ['тор']],
    ]);
    const displaysByPlayer = new Map([
      ['p1', ['РОТ']],
      ['p2', ['ТОР']],
    ]);

    const view = buildOnlineResultsView(t, session(), wordsByPlayer, { displaysByPlayer });
    expect(view.baseWordDisplay).toBe('ПОРТ');
    expect(view.roundDurationSeconds).toBe(600);
    expect(view.playerRankGroups[0]?.players[0]?.wordsPerMinute).toBe(0.1);
    expect(view.globalWords).toHaveLength(2);
    expect(view.playerRankGroups[0]?.players[0]?.playerName).toBe('Аня');
  });

  it('shows pseudonyms in finished public rooms', () => {
    const wordsByPlayer = new Map([
      ['p1', ['пер']],
      ['p2', []],
    ]);
    const displaysByPlayer = new Map([
      ['p1', ['ПЕР']],
      ['p2', []],
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
      wordsByPlayer,
      { displaysByPlayer, viewerUid: 'p2' },
    );
    expect(view.playerRankGroups[0]?.players[0]?.playerName).toBe('Гравець 1');
    expect(view.globalWords[0]?.authors[0]?.playerName).toBe('Гравець 1');
  });

  it('builds winner headline when word maps exist on a finished session', () => {
    const wordsByPlayer = new Map([
      ['p1', ['рот']],
      ['p2', ['тор']],
    ]);
    const displaysByPlayer = new Map([
      ['p1', ['РОТ']],
      ['p2', ['ТОР']],
    ]);

    const view = buildOnlineResultsView(
      t,
      {
        ...session(),
        wordPlayers: {
          рот: { p1: true },
          тор: { p2: true },
        },
      },
      wordsByPlayer,
      { displaysByPlayer },
    );

    expect(view.standings).toHaveLength(2);
    expect(view.isSolo).toBe(false);
    expect(view.headline).not.toBe('game.resultsTitle');
    expect(view.playerRankGroups[0]?.players[0]?.playerName).toBe('Аня');
  });
});
