import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { LobbyActionFooter } from '@/components/online/LobbyActionFooter';
import { LobbyBaseWordSection } from '@/components/online/LobbyBaseWordSection';
import { LobbyPlayerList } from '@/components/online/LobbyPlayerList';
import { LobbyPublicRoomSection } from '@/components/online/LobbyPublicRoomSection';
import { LobbyRoomCodeCard } from '@/components/online/LobbyRoomCodeCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { useLobbyActions } from '@/hooks/useLobbyActions';
import { useLobbyPickerSync } from '@/hooks/useLobbyPickerSync';
import { useLobbySession } from '@/hooks/useLobbySession';
import { useLiveRoundLobbyScreen } from '@/hooks/useLiveRoundLobbyScreen';
import { usePublicLobbyPublish } from '@/hooks/usePublicLobbyPublish';
import { useRoundPlayableLexicon } from '@/hooks/useRoundPlayableLexicon';
import { useServerNow } from '@/hooks/useServerNow';
import { useSyncedStackBack } from '@/hooks/useSyncedStackBack';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { resolveGameSessionSettingsForSession } from '@/lib/firebase/session-settings';
import { stackHeaderBack } from '@/lib/navigation/stack-header-options';
import {
  baseWordPickerTurnNumber,
  currentBaseWordPickerUid,
  isCurrentBaseWordPicker,
} from '@/lib/online/base-word-picker';
import { formatLobbySettingsLabel } from '@/lib/online/lobby-settings-label';
import { displayPlayerName } from '@/lib/online/public-lobby/display-player-name';
import {
  comparePlayersByJoinOrder,
  rosterJoinOrder,
} from '@/lib/online/public-lobby/session-identity';
import { isLobbyVisiblePlayer } from '@/lib/online/rematch-waiting-lobby';
import { useOrganizerAbandonWaitingOnExit } from '@/lib/online/use-organizer-abandon-on-exit';
import { usePlayerOnlinePresence } from '@/lib/online/use-player-online-presence';
import { useFirebaseStore } from '@/store/firebase-store';

/**
 * Waiting lobby — room code, players; base-word picker starts the round.
 */
export default function LobbyScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const { gameId: rawGameId, optedIn: rawOptedIn } = useLocalSearchParams<{
    gameId: string;
    optedIn?: string;
  }>();
  const gameId = rawGameId ?? '';
  const justOptedIn = rawOptedIn === '1';
  const firebaseUid = useFirebaseStore((state) => state.uid);
  const serverNow = useServerNow(30_000);
  const myUid = firebaseUid ?? '';
  const { isOnline: connectivityOnline } = useConnectivity();

  const { session, firebaseSessionLive, loading, error, setError, rematchArchive } =
    useLobbySession(gameId);

  useLiveRoundLobbyScreen({
    gameId,
    myUid,
    session,
    isFocused,
    justOptedIn,
    onJoinFailed: setError,
  });

  usePlayerOnlinePresence(
    gameId,
    myUid,
    Boolean(
      gameId &&
      myUid &&
      connectivityOnline &&
      firebaseSessionLive &&
      (session?.status === 'waiting' || session?.status === 'finished'),
    ),
  );
  const isOrganizer = session?.organizerId === myUid;

  useLobbyPickerSync({ gameId, session, isOrganizer, myUid });

  useOrganizerAbandonWaitingOnExit(
    gameId,
    myUid,
    session,
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
      .filter(([uid]) => isLobbyVisiblePlayer(session, uid))
      .map(([uid, player]) => ({ uid, ...player }))
      .sort((a, b) => comparePlayersByJoinOrder(a, b, joinOrder));
  }, [session]);

  const isFinished = session?.status === 'finished';
  const canStart = isPicker && firebaseSessionLive && session?.status === 'waiting' && hasBaseWord;

  const {
    starting,
    rematchLoading,
    handleStart,
    handleRematch,
    handleRetryRematch,
    handleLeaveToHome,
  } = useLobbyActions({ gameId, myUid, session, isOrganizer, rematchArchive, setError });

  const handleBack = useCallback(() => {
    if (isOrganizer && session?.status === 'waiting') {
      router.back();
      return;
    }
    handleLeaveToHome();
  }, [handleLeaveToHome, isOrganizer, session?.status]);

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

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <Screen>
        <LobbyRoomCodeCard roomCode={session.id} invitedByUid={myUid || undefined} />

        <LobbyBaseWordSection
          session={session}
          gameId={gameId}
          myUid={myUid}
          pickerUid={pickerUid}
          pickerName={pickerName}
          isPicker={isPicker}
          hasBaseWord={hasBaseWord}
          isFinished={Boolean(isFinished)}
          turnNumber={turnNumber}
          lobbyLexicon={lobbyLexicon}
          lobbyLexiconLoading={lobbyLexiconLoading}
        />

        <Text style={styles.settingsBanner}>{formatLobbySettingsLabel(t, session)}</Text>

        {isOrganizer && session.status === 'waiting' && hasBaseWord ? (
          <LobbyPublicRoomSection
            session={session}
            publicPublish={publicPublish}
            serverNow={serverNow}
            onError={() => {
              setError(t('online.errorPublicRoomFailed'));
            }}
          />
        ) : null}

        <LobbyPlayerList players={players} session={session} myUid={myUid} pickerUid={pickerUid} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <LobbyActionFooter
          gameId={gameId}
          isFinished={Boolean(isFinished)}
          isOrganizer={Boolean(isOrganizer)}
          isPicker={Boolean(isPicker)}
          hasBaseWord={hasBaseWord}
          isFirstRound={isFirstRound}
          canStart={Boolean(canStart)}
          starting={starting}
          rematchLoading={rematchLoading}
          lobbyLexiconLoading={lobbyLexiconLoading}
          pickerName={pickerName}
          turnNumber={turnNumber}
          onRematch={() => {
            void handleRematch();
          }}
          onStart={() => {
            void handleStart();
          }}
        />
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
    settingsBanner: {
      fontSize: 12,
      color: '#633806',
      backgroundColor: '#FAEEDA',
      borderRadius: radii.sm,
      padding: spacing.sm,
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
