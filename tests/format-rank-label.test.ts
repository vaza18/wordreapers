import { describe, expect, it } from 'vitest';

import { formatRankWithMedal } from '@/lib/game/format-rank-label';
import { roomStandingDisplayName } from '@/lib/online/room-standing-display-name';
import { computeRoomHistoryAggregate } from '@/lib/online/room-history-aggregate';
import type { FinishedRoundArchive } from '@/lib/online/online-session-archive';

describe('formatRankWithMedal', () => {
  it('prefixes podium emoji for ranks 1–3', () => {
    expect(formatRankWithMedal(1)).toBe('🥇 1');
    expect(formatRankWithMedal(2)).toBe('🥈 2');
    expect(formatRankWithMedal(3)).toBe('🥉 3');
    expect(formatRankWithMedal(4)).toBe('4');
  });
});

describe('roomStandingDisplayName', () => {
  it('resolves masked opponent alias at render time', () => {
    const archives: FinishedRoundArchive[] = [
      {
        gameId: 'NQ29',
        baseWordRound: 1,
        savedAt: 200,
        session: {
          baseWord: 'test',
          status: 'finished',
          settings: {
            durationSeconds: 600,
            uniqueBonusEnabled: false,
            language: 'uk-uk',
            allowProperNouns: false,
            allowSlang: false,
          },
          timerEndsAt: null,
          organizerId: 'uid-other',
          identityMasked: true,
          players: {
            'uid-self': { name: 'Василь', wordCount: 3, score: 6, online: true },
            'uid-other': {
              name: 'iPad Pro 13',
              wordCount: 6,
              score: 12,
              online: true,
              publicAlias: 'Гравець 1',
            },
          },
        },
        playerWords: {},
      },
    ];

    const aggregate = computeRoomHistoryAggregate('NQ29', archives, 'uid-self');
    expect(roomStandingDisplayName('uid-other', aggregate, 'uid-self')).toBe('Гравець 1');
    expect(roomStandingDisplayName('uid-self', aggregate, 'uid-self')).toBe('Василь');
  });
});
