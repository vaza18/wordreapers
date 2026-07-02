import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { PrimaryButton } from '@/components/PrimaryButton';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { formatStandingRowMeta } from '@/lib/game/format-play-stats';
import { assignDisplayRanks, type PlayerStandings } from '@/lib/game/scoring';
import type { GameSessionSnapshot } from '@/lib/firebase/game-session-service';
import { displayPlayerName } from '@/lib/online/public-lobby/display-player-name';

type PlayStandingsSheetProps = {
  visible: boolean;
  session: GameSessionSnapshot;
  myUid: string;
  standings: readonly PlayerStandings[];
  showPointUi: boolean;
  onClose: () => void;
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    standingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderTertiary,
    },
    standingRank: {
      width: 20,
      fontWeight: '700',
      color: colors.accent,
    },
    standingName: {
      flex: 1,
      fontSize: 15,
      color: colors.textPrimary,
    },
    standingMeta: {
      fontSize: 13,
      color: colors.textSecondary,
    },
  });
}

/**
 * Live standings bottom sheet during online play.
 */
export function PlayStandingsSheet({
  visible,
  session,
  myUid,
  standings,
  showPointUi,
  onClose,
}: PlayStandingsSheetProps) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const displayRanks = assignDisplayRanks([...standings]);

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <Text style={styles.modalTitle}>{t('game.standings')}</Text>
      {standings.map((row, index) => {
        const player = session.players[row.playerId];
        const name = player
          ? displayPlayerName(player, myUid, row.playerId, session)
          : row.playerId;
        const isMe = row.playerId === myUid;
        return (
          <View key={row.playerId} style={styles.standingRow}>
            <Text style={styles.standingRank}>{displayRanks.get(row.playerId) ?? index + 1}</Text>
            <Text style={styles.standingName}>
              {name}
              {isMe ? ` ${t('game.resultsYou')}` : ''}
            </Text>
            <Text style={styles.standingMeta}>
              {formatStandingRowMeta(row.wordCount, showPointUi ? row.score : null)}
            </Text>
          </View>
        );
      })}
      <PrimaryButton label={t('common.close')} variant="secondary" onPress={onClose} />
    </BottomSheetModal>
  );
}
