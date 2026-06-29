import { useTranslation } from 'react-i18next';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { modalCardChrome, modalOverlayBackground } from '@/lib/ui/modal-chrome';
import type { AddTimeVote, GameSession } from '@/lib/firebase/types';
import { formatPlayerLeftLabel, formatVoteStatusLabel } from '@/lib/game/vote-status-label';
import { buildEarlyFinishParticipantRows } from '@/lib/online/early-finish-vote';
import { formatTimerMs } from '@/lib/game/timer-label';
import { viewerNeedsAddTimeVote } from '@/lib/online/add-time-vote';
import { voteProposerName } from '@/lib/firebase/session-votes-service';

interface AddTimeVoteModalProps {
  visible: boolean;
  layout?: 'modal' | 'banner';
  session: GameSession;
  vote: AddTimeVote;
  myUid: string;
  serverNow: number;
  onYes: () => void;
  onNo: () => void;
  onCancelProposal?: () => void;
}

function VoteCard({
  layout = 'modal',
  session,
  vote,
  myUid,
  serverNow,
  onYes,
  onNo,
  onCancelProposal,
}: Omit<AddTimeVoteModalProps, 'visible'>) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const isBanner = layout === 'banner';
  const isProposer = vote.proposedBy === myUid;
  const needsVote = viewerNeedsAddTimeVote(session, vote, myUid);
  const participants = buildEarlyFinishParticipantRows(session, vote, myUid);

  const headline = isProposer
    ? t('game.voteAddTimeSent', { count: vote.addMinutes })
    : t('game.voteAddTime', {
        name: voteProposerName(session, vote.proposedBy, myUid),
        count: vote.addMinutes,
      });

  const timerEndsAt = session.timerEndsAt;
  const remainingMs = timerEndsAt != null ? Math.max(0, timerEndsAt - serverNow) : 0;
  const timerPreview =
    timerEndsAt != null
      ? t('game.voteAddTimeTimer', {
          from: formatTimerMs(remainingMs),
          to: formatTimerMs(remainingMs + vote.addMinutes * 60_000),
        })
      : null;

  return (
    <View
      style={
        isBanner ? styles.bannerWrap : [styles.overlay, { paddingBottom: spacing.lg + bottom }]
      }
    >
      <View style={isBanner ? styles.bannerCard : styles.card}>
        <Text style={styles.message}>{headline}</Text>
        {timerPreview ? <Text style={styles.timerPreview}>{timerPreview}</Text> : null}

        <View style={styles.participantList}>
          {participants.map((row) => (
            <View key={row.playerId} style={styles.participantRow}>
              <View style={styles.participantMain}>
                <Text style={styles.participantName} numberOfLines={1}>
                  {row.name}
                  {row.playerId === myUid ? ` ${t('game.resultsYou')}` : ''}
                </Text>
                <Text style={styles.participantPresence}>
                  {row.hasLeft
                    ? formatPlayerLeftLabel(t, row.gender)
                    : row.online
                      ? t('game.playerOnline')
                      : t('game.playerOffline')}
                </Text>
              </View>
              <Text style={styles.participantVote}>
                {formatVoteStatusLabel(t, row.voteStatus, row.hasLeft, row.gender)}
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

        {isProposer && onCancelProposal ? (
          <PrimaryButton label={t('game.voteAddTimeCancel')} onPress={onCancelProposal} />
        ) : null}
      </View>
    </View>
  );
}

export function AddTimeVoteModal({
  visible,
  layout = 'modal',
  session,
  vote,
  myUid,
  serverNow,
  onYes,
  onNo,
  onCancelProposal,
}: AddTimeVoteModalProps) {
  if (!visible) {
    return null;
  }

  const body = (
    <VoteCard
      layout={layout}
      session={session}
      vote={vote}
      myUid={myUid}
      serverNow={serverNow}
      onYes={onYes}
      onNo={onNo}
      onCancelProposal={onCancelProposal}
    />
  );

  if (layout === 'banner') {
    return body;
  }

  return (
    <Modal transparent visible animationType="fade" accessibilityViewIsModal>
      <SafeAreaProvider>{body}</SafeAreaProvider>
    </Modal>
  );
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
    timerPreview: {
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
