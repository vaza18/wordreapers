import { useTranslation } from 'react-i18next';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { modalCardChrome, modalOverlayBackground } from '@/lib/ui/modal-chrome';
import type { GameSession, SessionVote } from '@/lib/firebase/types';
import { formatPlayerLeftLabel, formatVoteStatusLabel } from '@/lib/game/vote-status-label';
import { buildEarlyFinishParticipantRows } from '@/lib/online/early-finish-vote';
import { viewerNeedsPauseVote } from '@/lib/online/pause-vote';
import { voteProposerName } from '@/lib/firebase/session-votes-service';

interface PauseVoteModalProps {
  visible: boolean;
  layout?: 'modal' | 'banner';
  session: GameSession;
  vote: SessionVote;
  myUid: string;
  onYes: () => void;
  onNo: () => void;
  onCancelProposal?: () => void;
}

function VoteCard({
  layout = 'modal',
  session,
  vote,
  myUid,
  onYes,
  onNo,
  onCancelProposal,
}: Omit<PauseVoteModalProps, 'visible'>) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const isBanner = layout === 'banner';
  const isProposer = vote.proposedBy === myUid;
  const needsVote = viewerNeedsPauseVote(session, vote, myUid);
  const participants = buildEarlyFinishParticipantRows(session, vote, myUid);

  const headline = isProposer
    ? t('game.votePauseSent')
    : t('game.votePause', { name: voteProposerName(session, vote.proposedBy, myUid) });

  return (
    <View
      style={
        isBanner ? styles.bannerWrap : [styles.overlay, { paddingBottom: spacing.lg + bottom }]
      }
    >
      <View style={isBanner ? styles.bannerCard : styles.card}>
        <Text style={styles.message}>{headline}</Text>

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
          <PrimaryButton label={t('game.votePauseCancel')} onPress={onCancelProposal} />
        ) : null}
      </View>
    </View>
  );
}

export function PauseVoteModal({
  visible,
  layout = 'modal',
  session,
  vote,
  myUid,
  onYes,
  onNo,
  onCancelProposal,
}: PauseVoteModalProps) {
  if (!visible) {
    return null;
  }

  const body = (
    <VoteCard
      layout={layout}
      session={session}
      vote={vote}
      myUid={myUid}
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
