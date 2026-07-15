import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderBarButton } from '@/components/HeaderBarButton';
import { MenuIcon } from '@/components/HeaderIcons';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SettingsIconButton } from '@/components/SettingsIconButton';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useHeaderIconButtonLayout } from '@/hooks/useHeaderIconButtonLayout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useServerNowWhen } from '@/hooks/useServerNow';
import { ConditionalModal } from '@/lib/ui/conditional-modal';
import { modalCardChrome, modalOverlayBackground } from '@/lib/ui/modal-chrome';
import { tGendered, type PlayerGender } from '@/lib/game/grammar';
import type { GameSession, SessionVote } from '@/lib/firebase/types';
import {
  buildEarlyFinishParticipantRows,
  EARLY_FINISH_VOTE_TIMEOUT_MS,
  viewerNeedsEarlyFinishVote,
} from '@/lib/online/voting/early-finish-vote';
import { displayPlayerName } from '@/lib/online/public-lobby/display-player-name';
import { playerGenderForDisplay } from '@/lib/online/public-lobby/session-identity';
import { RESUME_VOTE_TIMEOUT_MS, viewerNeedsResumeVote } from '@/lib/online/voting/resume-vote';
import { assignDisplayRanks, compareStandings, shouldShowPointUi } from '@/lib/game/scoring';
import { buildLiveStandingsFromSession } from '@/lib/online/live-standings';
import { formatStandingRowMeta } from '@/lib/game/format-play-stats';
import { formatPlayerLeftLabel, formatVoteStatusLabel } from '@/lib/game/vote-status-label';
import { resolveGameSessionSettingsForSession } from '@/lib/firebase/session-settings';
import { formatTimerMs } from '@/lib/game/timer-label';
import { voteProposerName } from '@/lib/firebase/session-votes-service';

interface PauseRoundModalProps {
  visible: boolean;
  session: GameSession;
  myUid: string;
  viewerGender: PlayerGender;
  serverNow?: number;
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
  /** When false, hide the hamburger (e.g. blocking session vote owns the screen). Default true. */
  canOpenMenu?: boolean;
  onOpenSettings: () => void;
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
  canOpenMenu = true,
  onOpenSettings,
}: Omit<PauseRoundModalProps, 'visible' | 'serverNow'> & { serverNow: number }) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { backIconSize, buttonSize } = useHeaderIconButtonLayout();
  const { top, bottom } = useSafeAreaInsets();
  const frozenMs = session.pauseState?.frozenRemainingMs ?? 0;
  const standings = useMemo(
    () => buildLiveStandingsFromSession(session).sort(compareStandings),
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
  /** Hide menu when parent blocks it (resume/early-finish votes) so pause UI stays visible. */
  const showMenuButton = canOpenMenu;

  return (
    <View
      style={[styles.overlay, { paddingTop: top + spacing.xs, paddingBottom: bottom + spacing.sm }]}
    >
      <View style={styles.topBar}>
        {showMenuButton ? (
          <HeaderBarButton accessibilityLabel={t('game.menu')} onPress={onOpenMenu}>
            <MenuIcon size={backIconSize} color={colors.textSecondary} />
          </HeaderBarButton>
        ) : (
          <View style={{ width: buttonSize, height: buttonSize }} />
        )}
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
            {t('game.pauseFrozenTimer', { time: formatTimerMs(frozenMs) })}
          </Text>
          <Text style={styles.body}>{tGendered(t, 'game.pauseBody', viewerGender)}</Text>

          <Text style={styles.sectionTitle}>{t('game.standings')}</Text>
          {standings.map((row) => {
            const player = session.players[row.playerId];
            const isMe = row.playerId === myUid;
            const presence = player?.online
              ? t('game.playerOnline')
              : player?.hasLeft
                ? formatPlayerLeftLabel(t, playerGenderForDisplay(session, myUid, row.playerId))
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
                        {row.online
                          ? t('game.playerOnline')
                          : row.hasLeft
                            ? formatPlayerLeftLabel(t, row.gender)
                            : t('game.playerOffline')}
                      </Text>
                    </View>
                    <Text style={styles.participantVote}>
                      {formatVoteStatusLabel(
                        t,
                        row.voteStatus,
                        !row.online && row.hasLeft,
                        row.gender,
                      )}
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
                        {row.online
                          ? t('game.playerOnline')
                          : row.hasLeft
                            ? formatPlayerLeftLabel(t, row.gender)
                            : t('game.playerOffline')}
                      </Text>
                    </View>
                    <Text style={styles.participantVote}>
                      {formatVoteStatusLabel(
                        t,
                        row.voteStatus,
                        !row.online && row.hasLeft,
                        row.gender,
                      )}
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
        </View>
      </View>
    </View>
  );
}

export function PauseRoundModal({
  visible,
  serverNow: serverNowProp,
  ...rest
}: PauseRoundModalProps) {
  const tickNow = useServerNowWhen(visible, 250);
  const serverNow = serverNowProp ?? tickNow;
  return (
    <ConditionalModal transparent visible={visible} animationType="fade">
      <SafeAreaProvider>
        <PauseBody {...rest} serverNow={serverNow} />
      </SafeAreaProvider>
    </ConditionalModal>
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
      alignItems: 'center',
      justifyContent: 'space-between',
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
