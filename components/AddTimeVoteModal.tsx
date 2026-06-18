import { useTranslation } from 'react-i18next';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, radii, spacing } from '@/constants/theme';
import type { AddTimeVote, GameSession } from '@/lib/firebase/types';
import { formatPlayerLeftLabel, formatVoteStatusLabel } from '@/lib/game/vote-status-label';
import { buildEarlyFinishParticipantRows } from '@/lib/online/early-finish-vote';
import { viewerNeedsAddTimeVote } from '@/lib/online/add-time-vote';
import { voteProposerName } from '@/lib/firebase/session-votes-service';

interface AddTimeVoteModalProps {
  visible: boolean;
  session: GameSession;
  vote: AddTimeVote;
  myUid: string;
  onYes: () => void;
  onNo: () => void;
  onCancelProposal?: () => void;
}

function VoteCard({
  session,
  vote,
  myUid,
  onYes,
  onNo,
  onCancelProposal,
}: Omit<AddTimeVoteModalProps, 'visible'>) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const isProposer = vote.proposedBy === myUid;
  const needsVote = viewerNeedsAddTimeVote(session, vote, myUid);
  const participants = buildEarlyFinishParticipantRows(session, vote);

  const headline = isProposer
    ? t('game.voteAddTimeSent', { count: vote.addMinutes })
    : t('game.voteAddTime', {
        name: voteProposerName(session, vote.proposedBy),
        count: vote.addMinutes,
      });

  return (
    <View style={[styles.overlay, { paddingBottom: spacing.lg + bottom }]}>
      <View style={styles.card}>
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
          <PrimaryButton label={t('game.voteAddTimeCancel')} onPress={onCancelProposal} />
        ) : null}
      </View>
    </View>
  );
}

export function AddTimeVoteModal({
  visible,
  session,
  vote,
  myUid,
  onYes,
  onNo,
  onCancelProposal,
}: AddTimeVoteModalProps) {
  return (
    <Modal transparent visible={visible} animationType="fade">
      <SafeAreaProvider>
        <VoteCard
          session={session}
          vote={vote}
          myUid={myUid}
          onYes={onYes}
          onNo={onNo}
          onCancelProposal={onCancelProposal}
        />
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
