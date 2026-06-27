import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { formatArchiveDateRange } from '@/lib/online/format-archive-date';
import { formatRoomStandingLine, roomStandingRanks } from '@/lib/online/format-room-standing-line';
import {
  didPlayerLeadRoomAggregate,
  type RoomHistoryAggregate,
} from '@/lib/online/room-history-aggregate';

export interface HistoryRoomAggregateCardProps {
  aggregate: RoomHistoryAggregate;
  myUid: string;
  onPress: () => void;
}

const TOP_STANDINGS_COUNT = 3;

export function HistoryRoomAggregateCard({
  aggregate,
  myUid,
  onPress,
}: HistoryRoomAggregateCardProps) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();

  const isViewerLeader = didPlayerLeadRoomAggregate(myUid, aggregate);
  const isMultiRoundRoom = aggregate.roundCount >= 2;
  const topStandings = useMemo(
    () => aggregate.standings.slice(0, TOP_STANDINGS_COUNT),
    [aggregate.standings],
  );
  const ranks = useMemo(() => roomStandingRanks(aggregate), [aggregate]);

  const body = (
    <>
      <Text style={styles.cardDate}>
        {formatArchiveDateRange(aggregate.oldestSavedAt, aggregate.newestSavedAt)}
      </Text>
      <Text style={styles.cardMeta}>
        {t('history.roomMeta', {
          code: aggregate.gameId,
          playerCount: aggregate.uniquePlayerCount,
          roundCount: aggregate.roundCount,
        })}
      </Text>
      {topStandings.map((row) => {
        const rank = ranks.get(row.playerId) ?? 0;
        return (
          <Text key={row.playerId} style={styles.standingLine}>
            {formatRoomStandingLine(t, aggregate, row, rank, myUid, 'card')}
          </Text>
        );
      })}
    </>
  );

  return (
    <FeedbackPressable
      accessibilityRole="button"
      feedback={false}
      style={[
        isMultiRoundRoom ? styles.multiRoundShell : styles.card,
        isMultiRoundRoom && isViewerLeader ? styles.multiRoundShellWinner : null,
        !isMultiRoundRoom && isViewerLeader ? styles.cardWinner : null,
      ]}
      onPress={onPress}
    >
      {isMultiRoundRoom ? (
        <View style={[styles.card, isViewerLeader ? styles.cardWinner : null]}>{body}</View>
      ) : (
        body
      )}
    </FeedbackPressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.backgroundPrimary,
      borderRadius: radii.md - 2,
      padding: spacing.md,
      gap: spacing.xs,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSecondary,
    },
    cardWinner: {
      backgroundColor: colors.accentMuted,
      borderColor: colors.accent,
      borderWidth: 1,
    },
    multiRoundShell: {
      borderWidth: 1,
      borderColor: colors.borderSecondary,
      borderRadius: radii.md,
      padding: 2,
    },
    multiRoundShellWinner: {
      borderColor: colors.accent,
    },
    cardDate: {
      fontSize: 13,
      color: colors.textTertiary,
    },
    cardMeta: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    standingLine: {
      fontSize: 15,
      color: colors.textPrimary,
      lineHeight: 20,
    },
  });
}
