import type { TFunction } from 'i18next';

import { formatRankWithMedal } from '@/lib/game/format-rank-label';
import { formatUkPoints, formatUkWords, formatUkWins } from '@/lib/i18n/uk-plural';
import { roomStandingDisplayName } from '@/lib/online/room-standing-display-name';
import {
  assignRoomDisplayRanks,
  type RoomHistoryAggregate,
  type RoomPlayerAggregate,
} from '@/lib/online/room-history-aggregate';

export function formatRoomStandingLine(
  t: TFunction,
  aggregate: RoomHistoryAggregate,
  row: RoomPlayerAggregate,
  rank: number,
  myUid: string,
  variant: 'card' | 'band',
): string {
  const params = {
    rank: formatRankWithMedal(rank),
    name: roomStandingDisplayName(row.playerId, aggregate, myUid),
    wins: formatUkWins(row.roundWins),
    scoreLabel: formatUkPoints(row.totalScore),
    words: formatUkWords(row.totalWords),
  };

  if (variant === 'band') {
    return aggregate.showScores
      ? t('history.roomStatsStandingWithScores', params)
      : t('history.roomStatsStanding', params);
  }

  return aggregate.showScores
    ? t('history.roomStandingWithScores', params)
    : t('history.roomStanding', params);
}

export function roomStandingRanks(aggregate: RoomHistoryAggregate): Map<string, number> {
  return assignRoomDisplayRanks(aggregate.standings, aggregate.showScores);
}
