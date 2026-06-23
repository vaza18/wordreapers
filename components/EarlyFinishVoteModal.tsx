import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import type { GameSession, SessionVote } from '@/lib/firebase/types';
import { formatPlayerLeftLabel, formatVoteStatusLabel } from '@/lib/game/vote-status-label';
import {
  buildEarlyFinishParticipantRows,
  EARLY_FINISH_VOTE_TIMEOUT_MS,
  viewerNeedsEarlyFinishVote,
} from '@/lib/online/early-finish-vote';
import { voteProposerName } from '@/lib/firebase/session-votes-service';

interface EarlyFinishVoteModalProps {
  visible: boolean;
  session: GameSession;
  vote: SessionVote;
  myUid: string;
  serverNow: number;
  onYes: () => void;
  onNo: () => void;
  onLeaveNow?: () => void;
  onCancelProposal?: () => void;
}

function VoteCard({
  session,
  vote,
  myUid,
  serverNow,
  onYes,
  onNo,
  onLeaveNow,
  onCancelProposal,
}: Omit<EarlyFinishVoteModalProps, 'visible'>) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const isProposer = vote.proposedBy === myUid;
  const needsVote = viewerNeedsEarlyFinishVote(session, vote, myUid);
  const participants = buildEarlyFinishParticipantRows(session, vote);

  const secondsLeft = useMemo(() => {
    const proposedAt = vote.proposedAt ?? serverNow;
    const remaining = Math.ceil((proposedAt + EARLY_FINISH_VOTE_TIMEOUT_MS - serverNow) / 1000);
    return Math.max(0, remaining);
  }, [serverNow, vote.proposedAt]);

  const headline = isProposer
    ? t('game.voteEarlyFinishSent')
    : t('game.voteEarlyFinish', { name: voteProposerName(session, vote.proposedBy) });

  return (
    <View style={[styles.overlay, { paddingBottom: spacing.lg + bottom }]}>
      <View style={styles.card}>
        <Text style={styles.message}>{headline}</Text>
        {secondsLeft > 0 ? (
          <Text style={styles.timer}>
            {t('game.voteEarlyFinishTimer', { seconds: secondsLeft })}
          </Text>
        ) : null}

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
          <PrimaryButton label={t('game.voteEarlyFinishCancel')} onPress={onCancelProposal} />
        ) : null}
        {isProposer && onLeaveNow ? (
          <PrimaryButton
            label={t('game.voteEarlyFinishLeaveNow')}
            variant="secondary"
            onPress={onLeaveNow}
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * Early-finish vote dialog with roster, online markers, and per-player vote status.
 */
export function EarlyFinishVoteModal({
  visible,
  session,
  vote,
  myUid,
  serverNow,
  onYes,
  onNo,
  onLeaveNow,
  onCancelProposal,
}: EarlyFinishVoteModalProps) {
  return (
    <Modal transparent visible={visible} animationType="fade">
      <SafeAreaProvider>
        <VoteCard
          session={session}
          vote={vote}
          myUid={myUid}
          serverNow={serverNow}
          onYes={onYes}
          onNo={onNo}
          onLeaveNow={onLeaveNow}
          onCancelProposal={onCancelProposal}
        />
      </SafeAreaProvider>
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
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    card: {
      backgroundColor: colors.backgroundPrimary,
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
    timer: {
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
      fontSize: 12,
      fontWeight: '500',
      color: colors.accent,
      maxWidth: 110,
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
