import { describe, expect, it } from 'vitest';

import { formatRoomStandingLine } from '@/lib/online/format-room-standing-line';
import { computeRoomHistoryAggregate } from '@/lib/online/room-history-aggregate';
import type { FinishedRoundArchive } from '@/lib/online/session/online-session-archive';

const t = ((key: string, params?: Record<string, string | number>) => {
  if (key === 'history.roomStandingWithScores') {
    return `${params?.rank} місце: ${params?.name} • ${params?.wins} • ${params?.scoreLabel} • ${params?.words}`;
  }
  return `${params?.rank} місце: ${params?.name} • ${params?.wins} • ${params?.words}`;
}) as Parameters<typeof formatRoomStandingLine>[0];

describe('formatRoomStandingLine', () => {
  it('includes score in the standing line when showScores is true', () => {
    const archives: FinishedRoundArchive[] = [
      {
        gameId: 'K123',
        baseWordRound: 0,
        savedAt: 100,
        session: {
          baseWord: 'test',
          status: 'finished',
          settings: {
            durationSeconds: 600,
            uniqueBonusMode: 'auto',
            uniqueBonusEnabled: true,
            language: 'uk-uk',
            allowProperNouns: false,
            allowSlang: false,
          },
          timerEndsAt: null,
          organizerId: 'a',
          players: {
            a: { name: 'A', wordCount: 5, score: 10, online: true },
            b: { name: 'B', wordCount: 4, score: 8, online: true },
            c: { name: 'C', wordCount: 3, score: 6, online: true },
          },
        },
        playerWords: {
          a: ['r0-0', 'r0-1', 'r0-2', 'r0-3', 'r0-4'],
          b: ['r0-5', 'r0-6', 'r0-7', 'r0-8'],
          c: ['r0-9', 'r0-10', 'r0-11'],
        },
      },
    ];

    const aggregate = computeRoomHistoryAggregate('K123', archives);
    const row = aggregate.standings[0];
    expect(row).toBeDefined();
    expect(formatRoomStandingLine(t, aggregate, row!, 1, '', 'card')).toContain('10\u00A0очок');
  });
});
