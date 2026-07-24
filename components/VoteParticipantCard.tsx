import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { formatPlayerLeftLabel, formatVoteStatusLabel } from '@/lib/game/vote-status-label';
import type { EarlyFinishParticipantRow } from '@/lib/online/voting/early-finish-vote';
import { modalCardChrome, modalOverlayBackground } from '@/lib/ui/modal-chrome';

export type VoteParticipantCardProps = {
  layout?: 'modal' | 'banner';
  headline: string;
  subheadline?: string | null;
  participants: EarlyFinishParticipantRow[];
  myUid: string;
  needsVote: boolean;
  isProposer: boolean;
  onYes: () => void;
  onNo: () => void;
  cancelLabel?: string;
  onCancelProposal?: () => void;
  /** When true, vote status treats only offline+hasLeft as "left" (pause / early finish). */
  voteLeftRequiresOffline?: boolean;
  /** When true, presence line prefers hasLeft over online (add-time vote). */
  presenceLeftFirst?: boolean;
  extraActions?: ReactNode;
};

export type VoteParticipantModalProps = VoteParticipantCardProps & {
  visible: boolean;
};

export function VoteParticipantCard({
  layout = 'modal',
  headline,
  subheadline,
  participants,
  myUid,
  needsVote,
  isProposer,
  onYes,
  onNo,
  cancelLabel,
  onCancelProposal,
  voteLeftRequiresOffline = true,
  presenceLeftFirst = false,
  extraActions,
}: VoteParticipantCardProps) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const isBanner = layout === 'banner';

  return (
    <View
      style={
        isBanner ? styles.bannerWrap : [styles.overlay, { paddingBottom: spacing.lg + bottom }]
      }
    >
      <View style={isBanner ? styles.bannerCard : styles.card}>
        <Text style={styles.message}>{headline}</Text>
        {subheadline ? <Text style={styles.subheadline}>{subheadline}</Text> : null}

        <View style={styles.participantList}>
          {participants.map((row) => (
            <View key={row.playerId} style={styles.participantRow}>
              <View style={styles.participantMain}>
                <Text style={styles.participantName} numberOfLines={1}>
                  {row.name}
                  {row.playerId === myUid ? ` ${t('game.resultsYou')}` : ''}
                </Text>
                <Text style={styles.participantPresence}>
                  {presenceLabel(t, row, presenceLeftFirst)}
                </Text>
              </View>
              <Text style={styles.participantVote}>
                {formatVoteStatusLabel(
                  t,
                  row.voteStatus,
                  voteLeftRequiresOffline ? !row.online && row.hasLeft : row.hasLeft,
                  row.gender,
                )}
              </Text>
            </View>
          ))}
        </View>

        {needsVote ? (
          <View style={styles.row}>
            <PrimaryButton label={t('game.voteYes')} style={styles.btn} onPress={onYes} />
            <PrimaryButton
              label={t('game.voteNo')}
              variant="secondary"
              style={styles.btn}
              onPress={onNo}
            />
          </View>
        ) : null}

        {isProposer && cancelLabel && onCancelProposal ? (
          <PrimaryButton label={cancelLabel} onPress={onCancelProposal} />
        ) : null}
        {extraActions}
      </View>
    </View>
  );
}

export function VoteParticipantModal({
  visible,
  layout = 'modal',
  ...cardProps
}: VoteParticipantModalProps) {
  if (!visible) {
    return null;
  }

  const body = <VoteParticipantCard layout={layout} {...cardProps} />;

  if (layout === 'banner') {
    return body;
  }

  // In-tree overlay (not RN Modal): after background / multi-sim focus, Modal can
  // show stale vote UI while ignoring presses and missing peer updates.
  return (
    <View style={hostStyles.host} pointerEvents="box-none" accessibilityViewIsModal>
      {body}
    </View>
  );
}

const hostStyles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFill,
    zIndex: 90,
  },
});

function presenceLabel(t: TFunction, row: EarlyFinishParticipantRow, leftFirst: boolean): string {
  if (leftFirst) {
    if (row.hasLeft) {
      return formatPlayerLeftLabel(t, row.gender);
    }
    return row.online ? t('game.playerOnline') : t('game.playerOffline');
  }
  if (row.online) {
    return t('game.playerOnline');
  }
  if (row.hasLeft) {
    return formatPlayerLeftLabel(t, row.gender);
  }
  return t('game.playerOffline');
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      backgroundColor: modalOverlayBackground(colors),
    },
    bannerWrap: {
      width: '100%',
    },
    bannerCard: {
      ...modalCardChrome(colors),
      borderRadius: radii.md,
      padding: spacing.md,
      gap: spacing.sm,
      alignItems: 'stretch',
      maxHeight: 240,
    },
    card: {
      ...modalCardChrome(colors),
      borderRadius: radii.md,
      padding: spacing.lg,
      gap: spacing.md,
      alignItems: 'stretch',
      maxHeight: '85%',
    },
    message: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    subheadline: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    participantList: {
      gap: spacing.xs,
    },
    participantRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderTertiary,
    },
    participantMain: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    participantName: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    participantPresence: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    participantVote: {
      flexShrink: 0,
      fontSize: 12,
      fontWeight: '500',
      color: colors.accent,
      textAlign: 'right',
    },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    btn: {
      flex: 1,
    },
  });
}
