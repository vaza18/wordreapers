import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { LobbyQrCode } from '@/components/LobbyQrCode';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SettingSwitch } from '@/components/SettingSwitch';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { formatRoomCodeDisplay } from '@/lib/firebase/format-room-code';
import {
  startGameSession,
  subscribeGameSession,
  type GameSessionSnapshot,
} from '@/lib/firebase/game-session-service';
import { syncPublicRosterAliases } from '@/lib/firebase/public-lobby-service';
import { clearWaitingLobbyPlayerWordsAsOrganizer } from '@/lib/firebase/player-words-service';
import { ensureAnonymousAuth } from '@/lib/firebase/auth';
import {
  baseWordPickerTurnNumber,
  currentBaseWordPickerUid,
  isCurrentBaseWordPicker,
} from '@/lib/online/base-word-picker';
import { formatLobbySettingsLabel } from '@/lib/online/lobby-settings-label';
import { resolveGameSessionSettingsForSession } from '@/lib/firebase/session-settings';
import { useRoundPlayableLexicon } from '@/hooks/useRoundPlayableLexicon';
import { usePublicLobbyPublish } from '@/hooks/usePublicLobbyPublish';
import { useServerNow } from '@/hooks/useServerNow';
import {
  latestFinishedArchiveForGame,
  type FinishedRoundArchive,
} from '@/lib/online/online-session-archive';
import { restartRematchOnlineRound } from '@/lib/online/restart-rematch-online-round';
import {
  comparePlayersByJoinOrder,
  playerGenderForDisplay,
  rosterJoinOrder,
} from '@/lib/online/public-lobby/session-identity';
import {
  displayPlayerName,
  viewerPublicAlias,
} from '@/lib/online/public-lobby/display-player-name';
import { needsPublicAliasReconcile } from '@/lib/online/public-lobby/public-alias';
import { PUBLIC_LOBBY_TTL_MS } from '@/lib/online/public-lobby/constants';
import {
  shouldSkipWaitingAbandonOnBack,
  type BackNavigationState,
} from '@/lib/online/should-skip-waiting-abandon-on-back';
import { useOrganizerAbandonWaitingOnExit } from '@/lib/online/use-organizer-abandon-on-exit';
import { usePlayerOnlinePresence } from '@/lib/online/use-player-online-presence';
import { exitOnlineToHome } from '@/lib/online/exit-online-flow';
import { useSyncedStackBack } from '@/hooks/useSyncedStackBack';
import { stackHeaderBack } from '@/lib/navigation/stack-header-options';
import { useFirebaseStore } from '@/store/firebase-store';
import { tGendered } from '@/lib/game/grammar';

/**
 * Waiting lobby — room code, players; base-word picker starts the round.
 */
export default function LobbyScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { gameId: rawGameId } = useLocalSearchParams<{ gameId: string }>();
  const gameId = rawGameId ?? '';
  const firebaseUid = useFirebaseStore((state) => state.uid);
  const serverNow = useServerNow(30_000);

  const [session, setSession] = useState<GameSessionSnapshot | null>(null);
  const [firebaseSessionLive, setFirebaseSessionLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [rematchLoading, setRematchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rematchArchive, setRematchArchive] = useState<FinishedRoundArchive | null | undefined>(
    undefined,
  );
  const lobbyWordsClearedForRoundRef = useRef<number | null>(null);

  useEffect(() => {
    if (!gameId) {
      return undefined;
    }
    void ensureAnonymousAuth();
    const unsubscribe = subscribeGameSession(gameId, (next) => {
      setSession(next);
      setFirebaseSessionLive(Boolean(next));
      setLoading(false);
    });
    return () => {
      unsubscribe();
    };
  }, [gameId]);

  useEffect(() => {
    if (!gameId || !session || !needsPublicAliasReconcile(session)) {
      return;
    }
    void syncPublicRosterAliases(gameId, session);
  }, [gameId, session]);

  useEffect(() => {
    if (loading || session) {
      return;
    }
    let cancelled = false;
    void latestFinishedArchiveForGame(gameId).then((archive) => {
      if (!cancelled) {
        setRematchArchive(archive);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [gameId, loading, session]);

  useEffect(() => {
    if (session?.status !== 'playing') {
      return;
    }
    router.replace({ pathname: '/online/play/[gameId]', params: { gameId } });
  }, [gameId, session?.status]);

  const myUid = firebaseUid ?? '';
  usePlayerOnlinePresence(
    gameId,
    myUid,
    Boolean(
      gameId &&
      myUid &&
      firebaseSessionLive &&
      (session?.status === 'waiting' || session?.status === 'finished'),
    ),
  );
  const isOrganizer = session?.organizerId === myUid;

  useEffect(() => {
    if (!gameId || !session || session.status !== 'waiting' || !isOrganizer || !myUid) {
      return;
    }
    const round = session.baseWordRound ?? 0;
    if (lobbyWordsClearedForRoundRef.current === round) {
      return;
    }
    lobbyWordsClearedForRoundRef.current = round;
    void clearWaitingLobbyPlayerWordsAsOrganizer(gameId, session, myUid);
  }, [gameId, isOrganizer, myUid, session]);

  useOrganizerAbandonWaitingOnExit(
    gameId,
    myUid,
    session?.status,
    Boolean(isOrganizer && (session?.status === 'waiting' || session?.status === 'finished')),
  );
  const pickerUid = session ? currentBaseWordPickerUid(session) : null;
  const isPicker = session && myUid ? isCurrentBaseWordPicker(session, myUid) : false;
  const pickerPlayer = pickerUid && session ? session.players[pickerUid] : undefined;
  const pickerName =
    pickerUid && session ? displayPlayerName(pickerPlayer, myUid, pickerUid, session) : '';
  const turnNumber = session ? baseWordPickerTurnNumber(session) : 1;
  const hasBaseWord = Boolean(session?.baseWord && session.baseWord.length >= 2);
  const isFirstRound = (session?.baseWordRound ?? 0) === 0;
  const resolvedLobbySettings = session ? resolveGameSessionSettingsForSession(session) : null;
  const publicPublish = usePublicLobbyPublish(gameId, session, myUid);
  const { lexicon: lobbyLexicon, loading: lobbyLexiconLoading } = useRoundPlayableLexicon({
    baseWord: session?.baseWord ?? '',
    allowProperNouns: resolvedLobbySettings?.allowProperNouns ?? false,
    allowSlang: resolvedLobbySettings?.allowSlang ?? false,
    enabled: hasBaseWord,
  });

  const players = useMemo(() => {
    if (!session) {
      return [];
    }
    const joinOrder = rosterJoinOrder(session);
    return Object.entries(session.players)
      .map(([uid, player]) => ({ uid, ...player }))
      .sort((a, b) => comparePlayersByJoinOrder(a, b, joinOrder));
  }, [session]);

  const isFinished = session?.status === 'finished';
  const canStart = isPicker && firebaseSessionLive && session?.status === 'waiting' && hasBaseWord;

  const handleRematch = async () => {
    if (!myUid || !session) {
      return;
    }
    setRematchLoading(true);
    setError(null);
    try {
      await restartRematchOnlineRound(gameId, myUid, session.baseWordRound ?? 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message !== 'REMATCH_FAILED') {
        setError(t('online.errorRematchFailed'));
      }
    } finally {
      setRematchLoading(false);
    }
  };

  const handleRetryRematch = async () => {
    if (!myUid || !rematchArchive) {
      return;
    }
    setRematchLoading(true);
    setError(null);
    try {
      await restartRematchOnlineRound(gameId, myUid, rematchArchive.baseWordRound);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'NO_FINISHED_ARCHIVE') {
        setError(t('online.roomClosedHint'));
      } else {
        setError(t('online.errorRematchFailed'));
      }
    } finally {
      setRematchLoading(false);
    }
  };

  const handleStart = async () => {
    if (!session || !myUid) {
      return;
    }
    setStarting(true);
    setError(null);
    try {
      await startGameSession(gameId, myUid);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'BASE_WORD_MISSING') {
        setError(t('online.errorBaseWordMissing'));
      } else {
        setError(t('online.errorStartFailed'));
      }
    } finally {
      setStarting(false);
    }
  };

  const handleLeaveToHome = useCallback(() => {
    if (!myUid) {
      return;
    }
    void exitOnlineToHome({
      gameId,
      uid: myUid,
      isOrganizer: Boolean(isOrganizer),
      sessionStatus: session?.status ?? 'waiting',
      session,
    });
  }, [gameId, isOrganizer, myUid, session]);

  const handleBack = useCallback(() => {
    if (!myUid) {
      return;
    }

    if (isOrganizer && session?.status === 'waiting') {
      const navState = navigation.getState() as BackNavigationState | undefined;
      if (navState && shouldSkipWaitingAbandonOnBack(navState, gameId)) {
        router.back();
        return;
      }
      router.replace({
        pathname: '/online/setup',
        params: { gameId, from: 'lobby' },
      });
      return;
    }

    handleLeaveToHome();
  }, [gameId, handleLeaveToHome, isOrganizer, myUid, navigation, session?.status]);

  const onBack = useSyncedStackBack(handleBack);

  const screenOptions = useMemo(
    () => ({
      ...stackHeaderBack(onBack),
    }),
    [onBack],
  );

  if (loading) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </>
    );
  }

  if (!session) {
    if (rematchArchive === undefined) {
      return (
        <>
          <Stack.Screen options={screenOptions} />
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        </>
      );
    }

    const canRetryRematch = Boolean(myUid && rematchArchive?.session.players[myUid]);

    return (
      <>
        <Stack.Screen options={screenOptions} />
        <Screen>
          <Text style={styles.error}>{t('online.errorRoomNotFound')}</Text>
          <Text style={styles.waitingHint}>
            {canRetryRematch ? t('online.roomRematchWaitingHint') : t('online.roomClosedHint')}
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {canRetryRematch ? (
            <PrimaryButton
              label={t('online.roomRematchRetry')}
              disabled={rematchLoading}
              onPress={() => {
                void handleRetryRematch();
              }}
            />
          ) : null}
          <PrimaryButton
            label={t('nav.home')}
            variant={canRetryRematch ? 'secondary' : 'primary'}
            onPress={handleLeaveToHome}
          />
        </Screen>
      </>
    );
  }

  const baseWordBlock =
    hasBaseWord && session.baseWord ? (
      <View style={styles.baseWordSection}>
        <Text style={styles.baseWordLabel}>{t('game.baseWord')}</Text>
        <Text style={styles.baseWordTitle}>{session.baseWord.toUpperCase()}</Text>
        <Text style={styles.baseWordMeta}>
          {tGendered(
            t,
            'online.baseWordChosenBy',
            myUid && pickerUid ? playerGenderForDisplay(session, myUid, pickerUid) : null,
            { name: pickerName },
          )}
        </Text>
        {isPicker && session.status === 'waiting' ? (
          <Text style={styles.baseWordChangeHint}>{t('online.baseWordChangeHint')}</Text>
        ) : null}
      </View>
    ) : null;

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <Screen>
        <View style={styles.codeCard}>
          <Text style={styles.code}>{formatRoomCodeDisplay(session.id)}</Text>
          <Text style={styles.codeLabel}>{t('online.roomCodeLabel')}</Text>
          <LobbyQrCode roomCode={session.id} invitedByUid={myUid || undefined} />
        </View>

        {!isFinished && !hasBaseWord ? (
          <Text style={styles.pickerBanner}>
            {isPicker
              ? t('online.baseWordPickerYourTurn', { turn: turnNumber })
              : t('online.baseWordPickerWaiting', { name: pickerName, turn: turnNumber })}
          </Text>
        ) : null}

        {baseWordBlock && isPicker && session.status === 'waiting' ? (
          <FeedbackPressable
            accessibilityRole="button"
            onPress={() => {
              router.push({ pathname: '/online/pick-word/[gameId]', params: { gameId } });
            }}
            style={styles.baseWordBannerPressable}
          >
            {baseWordBlock}
          </FeedbackPressable>
        ) : (
          baseWordBlock
        )}

        {hasBaseWord && lobbyLexicon ? (
          <Text style={styles.playableWordsHint}>
            {t('online.playableWordsMax', { count: lobbyLexicon.maxCount })}
          </Text>
        ) : hasBaseWord && lobbyLexiconLoading ? (
          <Text style={styles.playableWordsHint}>{t('game.playableWordsLoading')}</Text>
        ) : null}

        <Text style={styles.settingsBanner}>{formatLobbySettingsLabel(t, session)}</Text>

        {isOrganizer && session.status === 'waiting' && hasBaseWord ? (
          <View style={styles.publicSection}>
            <SettingSwitch
              label={t('online.publicRoom')}
              value={session.isPublic === true}
              onChange={(value) => {
                if (publicPublish.toggling) {
                  return;
                }
                if (value && !publicPublish.canPublish) {
                  return;
                }
                void publicPublish.togglePublic(value).catch(() => {
                  setError(t('online.errorPublicRoomFailed'));
                });
              }}
            />
            {!publicPublish.canPublish &&
            publicPublish.publishBlockReason &&
            publicPublish.publishBlockReason !== 'BASE_WORDS_LOADING' ? (
              <Text style={styles.publicHint}>{t('online.publicRoomNeedsSafeBaseWord')}</Text>
            ) : publicPublish.canPublish ? (
              <Text style={styles.publicHint}>{t('online.publicRoomHint')}</Text>
            ) : null}
            {session.isPublic && session.publicPublishedAt ? (
              <Text style={styles.publicExpiry}>
                {t('online.publicRoomExpiresIn', {
                  minutes: Math.max(
                    0,
                    Math.ceil(
                      (session.publicPublishedAt + PUBLIC_LOBBY_TTL_MS - serverNow) / 60_000,
                    ),
                  ),
                })}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>
          {t('online.playersCount', { count: players.length })}
        </Text>

        {players.map(({ uid, name, avatarColorIndex, online, ...playerRest }) => {
          const displayName = session
            ? displayPlayerName({ name, ...playerRest }, myUid, uid, session)
            : name;
          const seenAs = uid === myUid && session ? viewerPublicAlias(playerRest, session) : null;
          return (
            <View key={uid} style={styles.playerRow}>
              <PlayerAvatar name={displayName} avatarColorIndex={avatarColorIndex ?? 0} />
              <View style={styles.playerNameBlock}>
                <Text style={styles.playerName}>{displayName}</Text>
                {seenAs ? (
                  <Text style={styles.playerSeenAs}>
                    {t('online.youAreSeenAs', { alias: seenAs })}
                  </Text>
                ) : null}
              </View>
              {uid === session.organizerId ? (
                <Text style={styles.organizerTag}>{t('online.organizer')}</Text>
              ) : null}
              {uid === pickerUid && session.status === 'waiting' ? (
                <Text style={styles.pickerTag}>{t('online.pickerTag')}</Text>
              ) : null}
              {!online ? <Text style={styles.offlineTag}>📵</Text> : null}
            </View>
          );
        })}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isFinished ? (
          <>
            <PrimaryButton
              label={t('game.newGameSamePlayers')}
              disabled={rematchLoading}
              onPress={() => {
                void handleRematch();
              }}
            />
            {!isOrganizer ? (
              <Text style={styles.waitingHint}>{t('online.waitingForRematch')}</Text>
            ) : null}
          </>
        ) : null}

        {isPicker && !isFinished && !hasBaseWord ? (
          <PrimaryButton
            label={t('online.pickBaseWordAction')}
            onPress={() => {
              router.push({ pathname: '/online/pick-word/[gameId]', params: { gameId } });
            }}
          />
        ) : null}

        {isOrganizer && !isFinished && isFirstRound && !hasBaseWord ? (
          <PrimaryButton
            label={t('online.configureGame')}
            variant="secondary"
            onPress={() => {
              router.replace({
                pathname: '/online/setup',
                params: { gameId, from: 'lobby' },
              });
            }}
          />
        ) : null}

        {isPicker && !isFinished ? (
          <>
            <PrimaryButton
              label={t('online.startGame')}
              disabled={!canStart || starting}
              onPress={() => {
                void handleStart();
              }}
            />
            <Text style={styles.startHint}>{t('online.startHint')}</Text>
          </>
        ) : null}

        {!isPicker && !isFinished && hasBaseWord ? (
          <Text style={styles.waitingHint}>
            {t('online.waitingForRoundStart', { name: pickerName })}
          </Text>
        ) : null}

        {!isOrganizer && !isFinished && !hasBaseWord && !isPicker ? (
          <Text style={styles.waitingHint}>
            {t('online.baseWordPickerWaiting', { name: pickerName, turn: turnNumber })}
          </Text>
        ) : null}
      </Screen>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    codeCard: {
      backgroundColor: colors.backgroundPrimary,
      borderRadius: radii.md,
      padding: spacing.md,
      alignItems: 'center',
      gap: spacing.sm,
    },
    code: {
      fontSize: 28,
      fontWeight: '600',
      color: colors.accent,
      letterSpacing: 6,
    },
    codeLabel: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    pickerBanner: {
      fontSize: 14,
      fontWeight: '500',
      color: '#633806',
      backgroundColor: '#FAEEDA',
      borderRadius: radii.sm,
      padding: spacing.sm,
      textAlign: 'center',
    },
    baseWordSection: {
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
    },
    baseWordLabel: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    baseWordTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.accent,
      textAlign: 'center',
    },
    baseWordMeta: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    baseWordBannerPressable: {
      backgroundColor: colors.accentMuted,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      marginVertical: spacing.xs,
    },
    baseWordChangeHint: {
      fontSize: 11,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
    settingsBanner: {
      fontSize: 12,
      color: '#633806',
      backgroundColor: '#FAEEDA',
      borderRadius: radii.sm,
      padding: spacing.sm,
      textAlign: 'center',
    },
    publicSection: {
      gap: spacing.xs,
      marginVertical: spacing.xs,
    },
    publicHint: {
      fontSize: 11,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    publicExpiry: {
      fontSize: 11,
      color: colors.accent,
      textAlign: 'center',
      fontWeight: '500',
    },
    playableWordsHint: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
    sectionLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    playerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    playerNameBlock: {
      flex: 1,
      gap: 2,
    },
    playerName: {
      fontSize: 16,
      color: colors.textPrimary,
    },
    playerSeenAs: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    organizerTag: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.accent,
      backgroundColor: colors.accentMuted,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radii.sm,
    },
    pickerTag: {
      fontSize: 11,
      fontWeight: '600',
      color: '#633806',
      backgroundColor: '#FAEEDA',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radii.sm,
    },
    offlineTag: {
      fontSize: 14,
    },
    startHint: {
      fontSize: 12,
      color: colors.textTertiary,
      textAlign: 'center',
    },
    waitingHint: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    error: {
      color: '#E24B4A',
      fontSize: 14,
    },
  });
}
