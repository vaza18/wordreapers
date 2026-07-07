import { describe, expect, it } from 'vitest';

import { searchBaseWordPrefixResult, randomBaseWord } from '../lib/game/base-word-search.js';
import { formatVoteStatusLabel, playerGenderFromSession } from '../lib/game/vote-status-label.js';
import { isViewerWinner } from '../lib/game/is-viewer-winner.js';
import {
  didProfilePlayerWinLocalRound,
  normalizeProfilePlayerName,
  parsePlayerStats,
  shouldCountLocalRoundForProfile,
} from '../lib/profile/player-stats.js';
import { isProfileComplete, parsePlayerProfile } from '../lib/profile/player-profile.js';

describe('base-word-search', () => {
  const words = ['компютер', 'порт', 'портрет', 'ретро'];

  it('returns prefix matches in sorted order', () => {
    expect(searchBaseWordPrefixResult(words, 'пор', 2)).toEqual({
      words: ['порт', 'портрет'],
      total: 2,
    });
  });

  it('returns empty result for blank prefix', () => {
    expect(searchBaseWordPrefixResult(words, '   ')).toEqual({ words: [], total: 0 });
  });

  it('returns null for empty word list', () => {
    expect(randomBaseWord([])).toBeNull();
  });
});

describe('vote-status-label', () => {
  const t = (key: string) => key;

  it('maps session gender values', () => {
    expect(playerGenderFromSession('f')).toBe('f');
    expect(playerGenderFromSession(undefined)).toBeNull();
  });

  it('formats vote statuses and left players', () => {
    expect(formatVoteStatusLabel(t, 'yes', false, 'm')).toBe('game.voteStatusYes_n');
    expect(formatVoteStatusLabel(t, 'pending', true, 'f')).toBe('game.voteStatusLeft_n');
    expect(formatVoteStatusLabel(t, 'not_required', false, null)).toBe(
      'game.voteStatusNotRequired',
    );
  });
});

describe('is-viewer-winner', () => {
  it('detects viewer in the top rank group', () => {
    const section = {
      playerId: 'org',
      playerName: 'Org',
      avatarColorIndex: 0,
      rank: 1,
      score: 10,
      wordCount: 3,
      uniqueCount: 2,
      words: [],
      wordsPerMinute: null,
      isTopRank: true,
    };
    const groups = [
      { rank: 1, isTopRank: true, players: [section] },
      {
        rank: 2,
        isTopRank: false,
        players: [
          { ...section, playerId: 'guest', playerName: 'Guest', rank: 2, isTopRank: false },
        ],
      },
    ];

    expect(isViewerWinner(groups, 'org')).toBe(true);
    expect(isViewerWinner(groups, 'guest')).toBe(false);
  });
});

describe('player-stats', () => {
  it('parses stored stats safely', () => {
    expect(parsePlayerStats(null)).toEqual({
      gamesPlayed: 0,
      gamesWon: 0,
      wordsCollected: 0,
    });
    expect(
      parsePlayerStats(JSON.stringify({ gamesPlayed: 2.9, gamesWon: -1, wordsCollected: 5 })),
    ).toEqual({
      gamesPlayed: 2,
      gamesWon: 0,
      wordsCollected: 5,
    });
  });

  it('matches profile names case-insensitively in Ukrainian locale', () => {
    expect(normalizeProfilePlayerName('  Гість ')).toBe('гість');
    expect(shouldCountLocalRoundForProfile('Гість', ['ORG', 'гість'])).toBe(true);
  });

  it('detects local profile wins by display rank', () => {
    const won = didProfilePlayerWinLocalRound(
      'Гість',
      ['Org', 'Гість'],
      [
        { playerId: 'player-1', score: 10, wordCount: 3, uniqueCount: 2 },
        { playerId: 'player-0', score: 5, wordCount: 2, uniqueCount: 1 },
      ],
    );

    expect(won).toBe(true);
  });
});

describe('player-profile', () => {
  it('checks profile completeness', () => {
    expect(isProfileComplete({ name: '  ', gender: null, avatarColorIndex: 0 })).toBe(false);
    expect(isProfileComplete({ name: 'Гість', gender: 'f', avatarColorIndex: 1 })).toBe(true);
  });

  it('parses persisted profile json', () => {
    expect(
      parsePlayerProfile(JSON.stringify({ name: 'A', gender: 'x', avatarColorIndex: 99 })),
    ).toEqual({
      name: 'A',
      gender: null,
      avatarColorIndex: 5,
    });
  });
});
