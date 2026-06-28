import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { formatRoomHistoryDateRange } from '@/lib/online/format-archive-date';
import { formatRoomStandingLine, roomStandingRanks } from '@/lib/online/format-room-standing-line';
import type { RoomHistoryAggregate } from '@/lib/online/room-history-aggregate';

export interface HistoryRoomStatsBandProps {
  aggregate: RoomHistoryAggregate;
  myUid?: string;
}

const TOP_STANDINGS_COUNT = 3;

export function HistoryRoomStatsBand({ aggregate, myUid = '' }: HistoryRoomStatsBandProps) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();

  const topStandings = useMemo(
    () => aggregate.standings.slice(0, TOP_STANDINGS_COUNT),
    [aggregate.standings],
  );
  const ranks = useMemo(() => roomStandingRanks(aggregate), [aggregate]);

  return (
    <View style={styles.root}>
      <Text style={styles.summaryLine}>
        {t('history.roomStatsSummary', {
          dateRange: formatRoomHistoryDateRange(aggregate.oldestSavedAt, aggregate.newestSavedAt),
          playerCount: aggregate.uniquePlayerCount,
          roundCount: aggregate.roundCount,
        })}
      </Text>
      {topStandings.map((row) => {
        const rank = ranks.get(row.playerId) ?? 0;
        return (
          <Text key={row.playerId} style={styles.standingLine}>
            {formatRoomStandingLine(t, aggregate, row, rank, myUid, 'band')}
          </Text>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      gap: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSecondary,
      backgroundColor: colors.backgroundSecondary,
    },
    summaryLine: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    standingLine: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textPrimary,
    },
  });
}
