import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { RoundResultsView } from '@/components/RoundResultsView';
import { colors, spacing } from '@/constants/theme';
import { ensureAnonymousAuth } from '@/lib/firebase/auth';
import {
  leaveGameSession,
  subscribeGameSession,
  type GameSessionSnapshot,
} from '@/lib/firebase/game-session-service';
import {
  fetchSessionPlayerWords,
  subscribeSessionPlayerWords,
  type StoredPlayerWord,
} from '@/lib/firebase/player-words-service';
import { stillPlayingPlayerNames } from '@/lib/online/active-round-players';
import { mergeAllPlayerWords, type AllPlayerWords } from '@/lib/online/clone-player-words';
import {
  persistFinishedRoundForPlayer,
  persistFinishedRoundFromFirebase,
} from '@/lib/online/complete-pending-round-archive';
import { exitOnlineToHome } from '@/lib/online/exit-online-flow';
import {
  loadLatestFrozenFinishedRoundFromArchive,
  type FrozenFinishedRound,
} from '@/lib/online/frozen-finished-round';
import { markPendingRoundArchive } from '@/lib/online/pending-round-archive';
import { maskResultsForEarlyExit } from '@/lib/online/mask-results-for-viewer';
import { buildOnlineResultsView } from '@/lib/online/online-results-data';
import { resolvePostJoinRoute } from '@/lib/online/post-join-route';
import { rejoinOnlineRound } from '@/lib/online/rejoin-online-round';
import {
  notifyRoundFinishedOnce,
  isRoundFinishedNotified,
} from '@/lib/online/round-finished-notification-once';
import { useFirebaseStore } from '@/store/firebase-store';
import { useSyncedStackBack } from '@/hooks/useSyncedStackBack';
import { stackHeaderBack } from '@/lib/navigation/stack-header-options';
import { useProfileStore } from '@/store/profile-store';

const EMPTY_WORDS: AllPlayerWords = new Map();

/**
 * Summary after leaving an active online round — live RTDB while playing, local snapshot when finished.
 */
export default function OnlineLeftRoundScreen() {
  const { t } = useTranslation();
  const { gameId: rawGameId } = useLocalSearchParams<{ gameId: string }>();
  const gameId = rawGameId ?? '';
  const storeUid = useFirebaseStore((state) => state.uid);
  const [resolvedUid, setResolvedUid] = useState(storeUid ?? '');
  const myUid = resolvedUid || storeUid || '';

  const [session, setSession] = useState<GameSessionSnapshot | null>(null);
  const [liveWords, setLiveWords] = useState(EMPTY_WORDS);
  const [frozenRound, setFrozenRound] = useState<FrozenFinishedRound | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [wordsBootstrapComplete, setWordsBootstrapComplete] = useState(false);
  const [rejoinLoading, setRejoinLoading] = useState(false);
  const [rejoinError, setRejoinError] = useState<string | null>(null);
  const skipAutoLeaveRef = useRef(false);
  const finishedArchiveRef = useRef(false);
  const finishedNotifyRef = useRef(false);
  const freezeAttemptedRef = useRef(false);
  const pendingMarkedRoundRef = useRef<number | null>(null);

  const roundStillActive = session?.status === 'playing';
  const displaySession = frozenRound?.session ?? session;
  const wordsSnapshot = frozenRound?.words ?? liveWords;

  const rosterPlayerIds = useMemo(() => {
    if (frozenRound || !session) {
      return [];
    }
    return Object.keys(session.players).sort();
  }, [frozenRound, session]);

  const mergeWords = useCallback((incoming: AllPlayerWords) => {
    setLiveWords((prev) => mergeAllPlayerWords(prev, incoming));
  }, []);

  useEffect(() => {
    void ensureAnonymousAuth().then((user) => {
      setResolvedUid(user.uid);
    });
  }, []);

  useEffect(() => {
    if (skipAutoLeaveRef.current || rejoinLoading || !gameId || !myUid) {
      return;
    }
    const round = session?.baseWordRound ?? 0;
    if (pendingMarkedRoundRef.current === round) {
      return;
    }
    pendingMarkedRoundRef.current = round;
    void markPendingRoundArchive(gameId, round, myUid);
  }, [gameId, myUid, rejoinLoading, session?.baseWordRound]);

  useEffect(() => {
    if (
      skipAutoLeaveRef.current ||
      rejoinLoading ||
      !gameId ||
      !myUid ||
      session?.status !== 'playing'
    ) {
      return;
    }
    const me = session?.players[myUid];
    if (me && me.hasLeft !== true) {
      void (async () => {
        try {
          await leaveGameSession(gameId, myUid);
          await markPendingRoundArchive(gameId, session.baseWordRound ?? 0, myUid);
        } catch (error) {
          if (__DEV__) {
            console.warn('left screen leaveGameSession', error);
          }
        }
      })();
    }
  }, [gameId, myUid, rejoinLoading, session]);

  useEffect(() => {
    if (!gameId) {
      setSessionLoaded(true);
      return undefined;
    }
    const unsub = subscribeGameSession(gameId, (next) => {
      setSession(next);
      setSessionLoaded(true);
    });
    return unsub;
  }, [gameId]);

  useEffect(() => {
    if (!gameId || frozenRound || rosterPlayerIds.length === 0 || session?.status !== 'playing') {
      return undefined;
    }

    let cancelled = false;
    void fetchSessionPlayerWords(gameId, rosterPlayerIds).then((words) => {
      if (!cancelled) {
        mergeWords(words);
        setWordsBootstrapComplete(true);
      }
    });

    const unsubWords = subscribeSessionPlayerWords(gameId, rosterPlayerIds, mergeWords);
    return () => {
      cancelled = true;
      unsubWords();
    };
  }, [frozenRound, gameId, mergeWords, rosterPlayerIds, session?.status]);

  useEffect(() => {
    if (!gameId || freezeAttemptedRef.current || session?.status !== 'finished') {
      return;
    }
    freezeAttemptedRef.current = true;
    void (async () => {
      const archived = await loadLatestFrozenFinishedRoundFromArchive(gameId);
      if (archived) {
        setFrozenRound(archived);
        setWordsBootstrapComplete(true);
        return;
      }
      if (!session || !myUid) {
        return;
      }
      try {
        await persistFinishedRoundFromFirebase(gameId, myUid, session);
        const refreshed = await loadLatestFrozenFinishedRoundFromArchive(gameId);
        if (refreshed) {
          setFrozenRound(refreshed);
          setWordsBootstrapComplete(true);
          finishedArchiveRef.current = true;
        }
      } catch {
        freezeAttemptedRef.current = false;
      }
    })();
  }, [gameId, myUid, session]);

  useEffect(() => {
    if (
      !gameId ||
      !myUid ||
      !frozenRound ||
      finishedArchiveRef.current ||
      session?.status !== 'finished'
    ) {
      return;
    }
    finishedArchiveRef.current = true;
    void persistFinishedRoundForPlayer(gameId, myUid, frozenRound.session, frozenRound.words).catch(
      () => {
        finishedArchiveRef.current = false;
      },
    );
  }, [frozenRound, gameId, myUid, session?.status]);

  useEffect(() => {
    if (!gameId || !session || session.status !== 'finished' || finishedNotifyRef.current) {
      return;
    }
    const round = session.baseWordRound ?? 0;
    void (async () => {
      const sent = await notifyRoundFinishedOnce(gameId, round, session.baseWord);
      if (sent || (await isRoundFinishedNotified(gameId, round))) {
        finishedNotifyRef.current = true;
      }
    })();
  }, [gameId, session]);

  const viewData = useMemo(() => {
    if (!displaySession || !myUid) {
      return null;
    }
    const raw = buildOnlineResultsView(t, displaySession, wordsSnapshot);
    return maskResultsForEarlyExit(raw, myUid, t);
  }, [displaySession, myUid, t, wordsSnapshot]);

  const stillPlaying = useMemo(() => {
    if (!session || !myUid || session.status !== 'playing') {
      return [];
    }
    return stillPlayingPlayerNames(session, myUid);
  }, [myUid, session]);

  const handleRejoin = useCallback(async () => {
    if (!gameId || !myUid) {
      return;
    }
    skipAutoLeaveRef.current = true;
    setRejoinError(null);
    setRejoinLoading(true);
    try {
      const { name, gender, avatarColorIndex } = useProfileStore.getState();
      const joined = await rejoinOnlineRound(gameId, { name, gender, avatarColorIndex });
      router.replace(resolvePostJoinRoute(joined, myUid, gameId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'ROUND_ALREADY_FINISHED') {
        router.replace({ pathname: '/online/results/[gameId]', params: { gameId } });
        return;
      }
      if (message === 'NO_RESTORABLE_LOCAL_CACHE') {
        setRejoinError(t('game.rejoinExpired'));
        return;
      }
      setRejoinError(t('online.errorJoinFailed'));
    } finally {
      setRejoinLoading(false);
    }
  }, [gameId, myUid, t]);

  const handleHome = useCallback(async () => {
    const myWords = wordsSnapshot.get(myUid) ?? new Map<string, StoredPlayerWord>();
    if (session?.status === 'playing') {
      void markPendingRoundArchive(gameId, session.baseWordRound ?? 0, myUid);
    } else if (frozenRound && !finishedArchiveRef.current) {
      try {
        await persistFinishedRoundForPlayer(gameId, myUid, frozenRound.session, frozenRound.words);
        finishedArchiveRef.current = true;
      } catch (error) {
        if (__DEV__) {
          console.warn('handleHome persist archive', error);
        }
      }
    }
    await exitOnlineToHome({
      gameId,
      uid: myUid,
      isOrganizer: session?.organizerId === myUid,
      sessionStatus: session?.status ?? 'playing',
      session: displaySession ?? session,
      myWords,
      exitedResults: session?.status === 'finished' && session.players[myUid]?.hasLeft !== true,
    });
  }, [displaySession, frozenRound, gameId, myUid, session, wordsSnapshot]);

  const onBack = useSyncedStackBack(handleHome);

  const screenOptions = useMemo(
    () => ({
      ...stackHeaderBack(onBack),
    }),
    [onBack],
  );

  if (!gameId || !sessionLoaded || !myUid) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </>
    );
  }

  if (!displaySession || !viewData || (!wordsBootstrapComplete && !frozenRound)) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <RoundResultsView
        headline={t('game.leftRoundTitle')}
        baseWordDisplay={viewData.baseWordDisplay}
        totalDistinctWords={viewData.totalDistinctWords}
        globalWords={viewData.globalWords}
        playerRankGroups={viewData.playerRankGroups}
        highlightPlayerId={myUid}
        defaultExpandedPlayerId={myUid}
        showScores={viewData.uniqueBonusEnabled}
        showWordAuthors={!viewData.isSolo}
        roundDurationSeconds={viewData.roundDurationSeconds}
        footer={
          <>
            {roundStillActive ? (
              <Text style={styles.notice}>
                {stillPlaying.length > 0
                  ? t('game.leftRoundStillPlaying', { names: stillPlaying.join(', ') })
                  : t('game.leftRoundWaitingEnd')}
              </Text>
            ) : null}
            <Text style={styles.notice}>{t('game.leftRoundWordsHidden')}</Text>
            {rejoinError ? <Text style={styles.error}>{rejoinError}</Text> : null}
            {roundStillActive ? (
              <PrimaryButton
                label={t('game.rejoinRound')}
                disabled={rejoinLoading}
                onPress={() => {
                  void handleRejoin();
                }}
              />
            ) : null}
            {session?.status === 'finished' ? (
              <PrimaryButton
                label={t('game.viewResults')}
                onPress={() => {
                  router.replace({ pathname: '/online/results/[gameId]', params: { gameId } });
                }}
              />
            ) : null}
            <PrimaryButton label={t('nav.home')} variant="secondary" onPress={handleHome} />
          </>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundSecondary,
  },
  notice: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  error: {
    color: '#E24B4A',
    fontSize: 14,
    textAlign: 'center',
  },
});
