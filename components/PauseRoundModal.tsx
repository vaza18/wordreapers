import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { SettingsIconButton } from '@/components/SettingsIconButton';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { modalCardChrome, modalOverlayBackground } from '@/lib/ui/modal-chrome';
import { tGendered, type PlayerGender } from '@/lib/game/grammar';
import type { GameSession, SessionVote } from '@/lib/firebase/types';
import {
  buildEarlyFinishParticipantRows,
  EARLY_FINISH_VOTE_TIMEOUT_MS,
  viewerNeedsEarlyFinishVote,
} from '@/lib/online/early-finish-vote';
import { displayPlayerName } from '@/lib/online/public-lobby/display-player-name';
import { playerGenderForDisplay } from '@/lib/online/public-lobby/session-identity';
import { RESUME_VOTE_TIMEOUT_MS, viewerNeedsResumeVote } from '@/lib/online/resume-vote';
import {
  assignDisplayRanks,
  buildStandingsFromSession,
  compareStandings,
  shouldShowPointUi,
} from '@/lib/game/scoring';
import { formatStandingRowMeta } from '@/lib/game/format-play-stats';
import { formatPlayerLeftLabel, formatVoteStatusLabel } from '@/lib/game/vote-status-label';
import { resolveGameSessionSettingsForSession } from '@/lib/firebase/session-settings';
import { voteProposerName } from '@/lib/firebase/session-votes-service';

interface PauseRoundModalProps {
  visible: boolean;
  session: GameSession;
  myUid: string;
  viewerGender: PlayerGender;
  serverNow: number;
  resumeVote: SessionVote | null | undefined;
  earlyFinishVote: SessionVote | null | undefined;
  hasOnlineOpponent: boolean;
  onProposeResume: () => void;
  onResumeYes: () => void;
  onResumeNo: () => void;
  onCancelResumeProposal?: () => void;
  onEarlyFinishYes: () => void;
  onEarlyFinishNo: () => void;
  onCancelEarlyFinishProposal?: () => void;
  onLeaveNowFromEarlyFinish?: () => void;
  onOpenMenu: () => void;
  onOpenSettings: () => void;
}

function formatTimer(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function PauseBody({
  session,
  myUid,
  viewerGender,
  serverNow,
  resumeVote,
  earlyFinishVote,
  hasOnlineOpponent,
  onProposeResume,
  onResumeYes,
  onResumeNo,
  onCancelResumeProposal,
  onEarlyFinishYes,
  onEarlyFinishNo,
  onCancelEarlyFinishProposal,
  onLeaveNowFromEarlyFinish,
  onOpenMenu,
  onOpenSettings,
}: Omit<PauseRoundModalProps, 'visible'>) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const { top, bottom } = useSafeAreaInsets();
  const frozenMs = session.pauseState?.frozenRemainingMs ?? 0;
  const standings = useMemo(
    () => buildStandingsFromSession(session).sort(compareStandings),
    [session],
  );
  const displayRanks = useMemo(() => assignDisplayRanks(standings), [standings]);
  const showStandingsScores = shouldShowPointUi(
    resolveGameSessionSettingsForSession(session).uniqueBonusEnabled,
  );

  const resumeHeadline = useMemo(() => {
    if (!resumeVote) {
      return null;
    }
    if (resumeVote.proposedBy === myUid) {
      return t('game.voteResumeSent');
    }
    const proposerId = resumeVote.proposedBy;
    const proposerGender = playerGenderForDisplay(session, myUid, proposerId);
    return tGendered(t, 'game.voteResume', proposerGender, {
      name: voteProposerName(session, proposerId, myUid),
    });
  }, [myUid, resumeVote, session, t]);

  const resumeSecondsLeft = useMemo(() => {
    if (!resumeVote) {
      return 0;
    }
    const proposedAt = resumeVote.proposedAt ?? serverNow;
    const remaining = Math.ceil((proposedAt + RESUME_VOTE_TIMEOUT_MS - serverNow) / 1000);
    return Math.max(0, remaining);
  }, [resumeVote, serverNow]);

  const resumeParticipants = resumeVote
    ? buildEarlyFinishParticipantRows(session, resumeVote, myUid)
    : [];
  const needsResumeVote = resumeVote != null && viewerNeedsResumeVote(session, resumeVote, myUid);
  const isResumeProposer = resumeVote?.proposedBy === myUid;

  const earlyFinishHeadline = useMemo(() => {
    if (!earlyFinishVote) {
      return null;
    }
    if (earlyFinishVote.proposedBy === myUid) {
      return t('game.voteEarlyFinishSent');
    }
    return t('game.voteEarlyFinish', {
      name: voteProposerName(session, earlyFinishVote.proposedBy, myUid),
    });
  }, [earlyFinishVote, myUid, session, t]);

  const earlyFinishSecondsLeft = useMemo(() => {
    if (!earlyFinishVote) {
      return 0;
    }
    const proposedAt = earlyFinishVote.proposedAt ?? serverNow;
    const remaining = Math.ceil((proposedAt + EARLY_FINISH_VOTE_TIMEOUT_MS - serverNow) / 1000);
    return Math.max(0, remaining);
  }, [earlyFinishVote, serverNow]);

  const earlyFinishParticipants = earlyFinishVote
    ? buildEarlyFinishParticipantRows(session, earlyFinishVote, myUid)
    : [];
  const needsEarlyFinishVote =
    earlyFinishVote != null && viewerNeedsEarlyFinishVote(session, earlyFinishVote, myUid);
  const isEarlyFinishProposer = earlyFinishVote?.proposedBy === myUid;

  const resumeButtonLabel = hasOnlineOpponent
    ? tGendered(t, 'game.pauseReadyToResume', viewerGender)
    : t('game.pauseResumeNow');

  return (
    <View
      style={[styles.overlay, { paddingTop: top + spacing.xs, paddingBottom: bottom + spacing.sm }]}
    >
      <View style={styles.topBar}>
        <SettingsIconButton onPress={onOpenSettings} />
      </View>
      <View style={styles.card}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{t('game.pauseTitle')}</Text>
          <Text style={styles.timerLine}>
            {t('game.pauseFrozenTimer', { time: formatTimer(frozenMs) })}
          </Text>
          <Text style={styles.body}>{tGendered(t, 'game.pauseBody', viewerGender)}</Text>

          <Text style={styles.sectionTitle}>{t('game.standings')}</Text>
          {standings.map((row) => {
            const player = session.players[row.playerId];
            const isMe = row.playerId === myUid;
            const presence = player?.hasLeft
              ? formatPlayerLeftLabel(t, playerGenderForDisplay(session, myUid, row.playerId))
              : player?.online
                ? t('game.pauseStatusInRound')
                : t('game.playerOffline');
            const displayName = player
              ? displayPlayerName(player, myUid, row.playerId, session)
              : row.playerId;
            return (
              <View key={row.playerId} style={styles.standingRow}>
                <Text style={styles.standingRank}>{displayRanks.get(row.playerId) ?? '—'}</Text>
                <View style={styles.standingMain}>
                  <Text style={styles.standingName} numberOfLines={1}>
                    {displayName}
                    {isMe ? ` ${t('game.resultsYou')}` : ''}
                  </Text>
                  <Text style={styles.standingMeta}>
                    {presence} ·{' '}
                    {formatStandingRowMeta(row.wordCount, showStandingsScores ? row.score : null)}
                  </Text>
                </View>
              </View>
            );
          })}

          {earlyFinishVote ? (
            <View style={styles.resumeVoteSection}>
              <Text style={styles.resumeHeadline}>{earlyFinishHeadline}</Text>
              {earlyFinishSecondsLeft > 0 ? (
                <Text style={styles.resumeTimer}>
                  {t('game.voteEarlyFinishTimer', { seconds: earlyFinishSecondsLeft })}
                </Text>
              ) : null}
              <View style={styles.participantList}>
                {earlyFinishParticipants.map((row) => (
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
            </View>
          ) : resumeVote ? (
            <View style={styles.resumeVoteSection}>
              <Text style={styles.resumeHeadline}>{resumeHeadline}</Text>
              {resumeSecondsLeft > 0 ? (
                <Text style={styles.resumeTimer}>
                  {t('game.voteResumeTimer', { seconds: resumeSecondsLeft })}
                </Text>
              ) : null}
              <View style={styles.participantList}>
                {resumeParticipants.map((row) => (
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
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {earlyFinishVote ? (
            <>
              {needsEarlyFinishVote ? (
                <View style={styles.row}>
                  <PrimaryButton
                    label={t('game.voteYes')}
                    style={styles.btn}
                    onPress={onEarlyFinishYes}
                  />
                  <PrimaryButton
                    label={t('game.voteNo')}
                    variant="secondary"
                    style={styles.btn}
                    onPress={onEarlyFinishNo}
                  />
                </View>
              ) : null}
              {isEarlyFinishProposer && onCancelEarlyFinishProposal ? (
                <PrimaryButton
                  label={t('game.voteEarlyFinishCancel')}
                  onPress={onCancelEarlyFinishProposal}
                />
              ) : null}
              {isEarlyFinishProposer && onLeaveNowFromEarlyFinish ? (
                <PrimaryButton
                  label={t('game.voteEarlyFinishLeaveNow')}
                  variant="secondary"
                  onPress={onLeaveNowFromEarlyFinish}
                />
              ) : null}
            </>
          ) : resumeVote ? (
            <>
              {needsResumeVote ? (
                <View style={styles.row}>
                  <PrimaryButton
                    label={t('game.voteYes')}
                    style={styles.btn}
                    onPress={onResumeYes}
                  />
                  <PrimaryButton
                    label={t('game.voteNo')}
                    variant="secondary"
                    style={styles.btn}
                    onPress={onResumeNo}
                  />
                </View>
              ) : null}
              {isResumeProposer && onCancelResumeProposal ? (
                <PrimaryButton
                  label={t('game.voteResumeCancel')}
                  onPress={onCancelResumeProposal}
                />
              ) : null}
            </>
          ) : (
            <PrimaryButton label={resumeButtonLabel} onPress={onProposeResume} />
          )}
          {!earlyFinishVote ? (
            <PrimaryButton label={t('game.menu')} variant="secondary" onPress={onOpenMenu} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function PauseRoundModal(props: PauseRoundModalProps) {
  return (
    <Modal transparent visible={props.visible} animationType="fade">
      <SafeAreaProvider>
        <PauseBody {...props} />
      </SafeAreaProvider>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      paddingHorizontal: spacing.md,
      backgroundColor: modalOverlayBackground(colors),
    },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingBottom: spacing.xs,
    },
    card: {
      flex: 1,
      ...modalCardChrome(colors),
      borderRadius: radii.lg,
      overflow: 'hidden',
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: spacing.lg,
      paddingBottom: spacing.sm,
      gap: spacing.sm,
    },
    footer: {
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderTertiary,
      backgroundColor: colors.modalSurface,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    timerLine: {
      fontSize: 24,
      fontWeight: '600',
      color: colors.accent,
      textAlign: 'center',
      letterSpacing: 1,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
      marginTop: spacing.xs,
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
      width: 24,
      fontSize: 15,
      fontWeight: '700',
      color: colors.accent,
      textAlign: 'center',
    },
    standingMain: {
      flex: 1,
      gap: 2,
    },
    standingName: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    standingMeta: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    resumeVoteSection: {
      gap: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderTertiary,
      paddingTop: spacing.sm,
      marginTop: spacing.xs,
    },
    resumeHeadline: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    resumeTimer: {
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
