import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { SheetHeader } from '@/components/SheetHeader';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import type { GameSession } from '@/lib/firebase/types';
import { formatStandingRowMeta } from '@/lib/game/format-play-stats';
import type { PlayerStandings } from '@/lib/game/scoring';
import { formatPlayerLeftLabel } from '@/lib/game/vote-status-label';
import { displayPlayerName } from '@/lib/online/public-lobby/display-player-name';
import { playerGenderForDisplay } from '@/lib/online/public-lobby/session-identity';
import { buildStandingsSheetDetails } from '@/lib/online/standings-sheet-details';

const COPY_FLASH_MS = 1600;

type PlayStandingsSheetProps = {
  visible: boolean;
  onClose: () => void;
  gameId: string;
  /** Same session used for live standings (displaySession / frozen). */
  session: GameSession;
  myUid: string;
  standings: PlayerStandings[];
  displayRanks: Map<string, number>;
  showPointUi: boolean;
  maxPlayableWords: number | null;
};

/**
 * In-round multiplayer standings bottom sheet with round details and ✕ close.
 */
export function PlayStandingsSheet({
  visible,
  onClose,
  gameId,
  session,
  myUid,
  standings,
  displayRanks,
  showPointUi,
  maxPlayableWords,
}: PlayStandingsSheetProps) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const [copiedFlash, setCopiedFlash] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollMaxHeight = Math.round(windowHeight * 0.62);

  const details = useMemo(
    () =>
      buildStandingsSheetDetails(t, {
        gameId,
        session,
        maxPlayableWords,
      }),
    [gameId, maxPlayableWords, session, t],
  );

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const onCopyRoomCode = () => {
    void (async () => {
      await Clipboard.setStringAsync(details.roomCodeRaw);
      setCopiedFlash(true);
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = setTimeout(() => {
        setCopiedFlash(false);
      }, COPY_FLASH_MS);
    })();
  };

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <SheetHeader title={t('game.standings')} onClose={onClose} />
      <ScrollView
        style={{ maxHeight: scrollMaxHeight }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={standings.length > 4}
      >
        {standings.map((row, index) => {
          const player = session.players[row.playerId];
          const name = player
            ? displayPlayerName(player, myUid, row.playerId, session)
            : row.playerId;
          const isMe = row.playerId === myUid;
          const presence = player?.online
            ? t('game.playerOnline')
            : player?.hasLeft
              ? formatPlayerLeftLabel(t, playerGenderForDisplay(session, myUid, row.playerId))
              : t('game.playerOffline');
          return (
            <View key={row.playerId} style={styles.standingRow}>
              <Text style={styles.standingRank}>{displayRanks.get(row.playerId) ?? index + 1}</Text>
              <View style={styles.standingMain}>
                <Text style={styles.standingName} numberOfLines={1}>
                  {name}
                  {isMe ? ` ${t('game.resultsYou')}` : ''}
                </Text>
                <Text style={styles.standingMeta}>
                  {presence} ·{' '}
                  {formatStandingRowMeta(row.wordCount, showPointUi ? row.score : null)}
                </Text>
              </View>
            </View>
          );
        })}

        <View style={styles.detailsDivider} />
        <Text style={styles.detailsTitle}>{t('game.standingsRoundDetails')}</Text>

        <DetailRow
          styles={styles}
          label={t('game.standingsDetailRoom')}
          value={details.roomCodeDisplay}
          onValuePress={onCopyRoomCode}
          valueA11y={t('game.standingsRoomCodeCopyA11y', { code: details.roomCodeDisplay })}
        />
        {copiedFlash ? (
          <Text style={styles.copiedHint}>{t('game.standingsRoomCodeCopied')}</Text>
        ) : null}
        <DetailRow
          styles={styles}
          label={t('game.standingsDetailBaseWord')}
          value={details.baseWordDisplay}
        />
        <DetailRow
          styles={styles}
          label={t('game.standingsDetailRound')}
          value={String(details.round)}
        />
        <DetailRow
          styles={styles}
          label={t('game.standingsDetailWordsCollected')}
          value={details.wordsCollectedCaption}
        />
        <DetailRow
          styles={styles}
          label={t('game.standingsDetailDuration')}
          value={t('game.standingsDetailDurationValue', { minutes: details.durationMinutes })}
        />
        <DetailRow
          styles={styles}
          label={t('game.standingsDetailUniqueBonus')}
          value={
            details.uniqueBonusEnabled
              ? t('game.standingsDetailUniqueBonusOn')
              : t('game.standingsDetailUniqueBonusOff')
          }
        />
      </ScrollView>
    </BottomSheetModal>
  );
}

function DetailRow({
  styles,
  label,
  value,
  onValuePress,
  valueA11y,
}: {
  styles: ReturnType<typeof createStyles>;
  label: string;
  value: string;
  onValuePress?: () => void;
  valueA11y?: string;
}) {
  const valueNode = (
    <Text style={styles.detailValue} numberOfLines={2}>
      {value}
    </Text>
  );
  let valueWrap: ReactNode = <View style={styles.detailValueWrap}>{valueNode}</View>;
  if (onValuePress) {
    valueWrap = (
      <FeedbackPressable
        accessibilityRole="button"
        accessibilityLabel={valueA11y ?? value}
        onPress={onValuePress}
        style={styles.detailValueWrap}
      >
        {valueNode}
      </FeedbackPressable>
    );
  }

  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      {valueWrap}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      gap: spacing.xs,
      paddingBottom: spacing.xs,
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
    standingMain: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    standingName: {
      fontSize: 15,
      color: colors.textPrimary,
    },
    standingMeta: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    detailsDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderTertiary,
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    detailsTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: spacing.xs,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: 3,
    },
    detailLabel: {
      flexShrink: 0,
      maxWidth: '48%',
      fontSize: 13,
      color: colors.textSecondary,
      paddingTop: 1,
    },
    detailValueWrap: {
      flex: 1,
      minWidth: 0,
      alignItems: 'flex-end',
    },
    detailValue: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textPrimary,
      textAlign: 'right',
    },
    copiedHint: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'right',
      marginTop: -2,
      marginBottom: 2,
    },
  });
}
