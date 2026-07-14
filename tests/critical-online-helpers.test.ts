import { describe, expect, it, vi } from 'vitest';

import { formatWinnerHeadline, genderedI18nKey, tGendered } from '../lib/game/grammar.js';
import {
  activeRoundPlayerRows,
  stillPlayingPlayerNames,
} from '../lib/online/presence/active-round-players.js';
import { buildRoomJoinUrl } from '../lib/online/join-link.js';
import {
  playToastRankSignature,
  playToastRosterSignature,
} from '../lib/online/play-toast-session-signature.js';
import { DEFAULT_SESSION_SETTINGS, playingSession } from './helpers/game-session-fixtures.js';

vi.mock('expo-linking', () => ({
  createURL: (path: string, options?: { queryParams?: Record<string, string> }) => {
    const query = new URLSearchParams(options?.queryParams).toString();
    return query ? `${path}?${query}` : path;
  },
}));

describe('grammar', () => {
  const t = (key: string) => key;

  it('builds gendered i18n keys', () => {
    expect(genderedI18nKey('game.winner', 'f')).toBe('game.winner_f');
    expect(genderedI18nKey('game.winner', null)).toBe('game.winner_n');
  });

  it('falls back to neutral gendered copy when variant is missing', () => {
    expect(tGendered(t, 'missing.key', 'f')).toBe('missing.key_n');
  });

  it('formats winner headlines without scores', () => {
    expect(formatWinnerHeadline(t, 'm', { name: 'Артем', score: 10, words: 3 }, false)).toBe(
      'game.winnerLineMaleWords',
    );
    expect(formatWinnerHeadline(t, 'f', { name: 'Юля', score: 10, words: 3 }, false)).toBe(
      'game.winnerLineFemaleWords',
    );
    expect(formatWinnerHeadline(t, null, { name: 'Гість', score: 5, words: 2 }, false)).toBe(
      'game.winnerLineNeutralWords',
    );
  });

  it('uses gendered score headlines when enabled', () => {
    expect(formatWinnerHeadline(t, 'f', { name: 'Юля', score: 10, words: 3 })).toBe(
      'game.winnerLineFemale',
    );
    expect(formatWinnerHeadline(t, 'm', { name: 'Артем', score: 10, words: 3 })).toBe(
      'game.winnerLineMale',
    );
    expect(formatWinnerHeadline(t, null, { name: 'Гість', score: 5, words: 2 })).toBe(
      'game.winnerLineNeutral',
    );
  });
});

describe('join-link', () => {
  it('builds join URLs with normalized room code', () => {
    expect(buildRoomJoinUrl('abcde')).toBe('/online/join?code=ABCDE');
    expect(buildRoomJoinUrl('abcde', 'org-1')).toBe('/online/join?code=ABCDE&invitedBy=org-1');
  });
});

describe('play-toast-session-signature', () => {
  it('builds roster signatures without scores', () => {
    const session = {
      id: 'ABCDE',
      ...playingSession({
        org: { name: 'Org', wordCount: 1, score: 5, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
      }),
      settings: DEFAULT_SESSION_SETTINGS,
      baseWordRound: 0,
      liveRoundPlayerUids: ['org', 'guest'],
    };

    const signature = playToastRosterSignature(session);
    expect(signature).toContain('ABCDE:playing:0');
    expect(signature).not.toContain(':5:');
  });

  it('builds rank signatures from word maps', () => {
    const session = {
      id: 'ABCDE',
      ...playingSession({
        org: { name: 'Org', wordCount: 1, score: 5, online: true },
      }),
      settings: DEFAULT_SESSION_SETTINGS,
      wordPlayers: { порт: { org: true } },
    };

    expect(playToastRankSignature(session)).toContain('org:');
  });
});

describe('active-round-players', () => {
  it('lists live participants with presence flags', () => {
    const rows = activeRoundPlayerRows(
      playingSession({
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: false, hasLeft: true },
      }),
    );

    expect(rows).toEqual([{ playerId: 'org', name: 'Org', online: true, hasLeft: false }]);
  });

  it('returns still-playing names excluding viewer', () => {
    const names = stillPlayingPlayerNames(
      playingSession({
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
      }),
      'org',
    );

    expect(names).toEqual(['Guest']);
  });
});
