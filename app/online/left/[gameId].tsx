import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { RoundResultsView } from '@/components/RoundResultsView';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
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
  freezeFinishedRound,
  loadFrozenFinishedRoundFromArchive,
  type FrozenFinishedRound,
} from '@/lib/online/frozen-finished-round';
import { markPendingRoundArchive } from '@/lib/online/pending-round-archive';
import { maskResultsForEarlyExit } from '@/lib/online/mask-results-for-viewer';
import { buildOnlineResultsView } from '@/lib/online/online-results-data';
import { getFinishedRoundArchive } from '@/lib/online/online-session-archive';
import { onlineResultsRoute } from '@/lib/online/online-results-route';
import {
  isLiveSessionForLeftRound,
  resolveLeftRoundDisplaySession,
  resolveLeftRoundResultsBaseWordRound,
  shouldAcceptLeftRoundFrozenArchive,
  shouldLoadLeftRoundFinishedArchive,
  shouldPersistLeftRoundFinishedArchive,
  shouldShowLeftRoundViewResults,
} from '@/lib/online/left-round-screen-actions';
import { resolvePostJoinRoute } from '@/lib/online/post-join-route';
import { rejoinOnlineRound } from '@/lib/online/rejoin-online-round';
import {
  notifyRoundFinishedOnce,
  isRoundFinishedNotified,
} from '@/lib/online/round-finished-notification-once';
import { useFirebaseStore } from '@/store/firebase-store';
import { useResultsRoundLexicon } from '@/hooks/useResultsRoundLexicon';
import { useSyncedStackBack } from '@/hooks/useSyncedStackBack';
import type { PlayableLexiconSnapshot } from '@/lib/dictionary/round-playable-lexicon';
import { stackHeaderBack } from '@/lib/navigation/stack-header-options';
import { tGendered } from '@/lib/game/grammar';
import { useProfileStore } from '@/store/profile-store';

const EMPTY_WORDS: AllPlayerWords = new Map();

/**
 * Summary after leaving an active online round — live RTDB while playing, local snapshot when finished.
 */
export default function OnlineLeftRoundScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { gameId: rawGameId } = useLocalSearchParams<{ gameId: string }>();
  const gameId = rawGameId ?? '';
  const storeUid = useFirebaseStore((state) => state.uid);
  const viewerGender = useProfileStore((state) => state.gender);
  const [resolvedUid, setResolvedUid] = useState(storeUid ?? '');
  const myUid = resolvedUid || storeUid || '';

  const [session, setSession] = useState<GameSessionSnapshot | null>(null);
  const [liveWords, setLiveWords] = useState(EMPTY_WORDS);
  const [frozenRound, setFrozenRound] = useState<FrozenFinishedRound | null>(null);
  const [leftAtBaseWordRound, setLeftAtBaseWordRound] = useState<number | null>(null);
  const [leftRoundPlayingSnapshot, setLeftRoundPlayingSnapshot] =
    useState<FrozenFinishedRound | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [wordsBootstrapComplete, setWordsBootstrapComplete] = useState(false);
  const [rejoinLoading, setRejoinLoading] = useState(false);
  const [rejoinError, setRejoinError] = useState<string | null>(null);
  const [viewResultsUnlocked, setViewResultsUnlocked] = useState(false);
  const skipAutoLeaveRef = useRef(false);
  const leaveAttemptedRef = useRef(false);
  const finishedArchiveRef = useRef(false);
  const finishedNotifyRef = useRef(false);
  const freezeAttemptedRef = useRef(false);
  const pendingMarkedRoundRef = useRef<number | null>(null);
  const [archiveLexicon, setArchiveLexicon] = useState<PlayableLexiconSnapshot | null>(null);

  const pinnedFrozenRound =
    frozenRound &&
    shouldAcceptLeftRoundFrozenArchive(frozenRound.session.baseWordRound, leftAtBaseWordRound)
      ? frozenRound
      : null;
  const displaySession = useMemo(
    () =>
      resolveLeftRoundDisplaySession({
        leftAtBaseWordRound,
        liveSession: session,
        pinnedFrozenSession: pinnedFrozenRound?.session ?? null,
        playingSnapshotSession: leftRoundPlayingSnapshot?.session ?? null,
      }),
    [leftAtBaseWordRound, leftRoundPlayingSnapshot, pinnedFrozenRound, session],
  );
  const wordsSnapshot = useMemo(() => {
    if (pinnedFrozenRound) {
      return pinnedFrozenRound.words;
    }
    if (isLiveSessionForLeftRound(leftAtBaseWordRound, session)) {
      return liveWords;
    }
    if (
      leftAtBaseWordRound != null &&
      leftRoundPlayingSnapshot &&
      (leftRoundPlayingSnapshot.session.baseWordRound ?? 0) === leftAtBaseWordRound
    ) {
      return leftRoundPlayingSnapshot.words;
    }
    return liveWords;
  }, [leftAtBaseWordRound, leftRoundPlayingSnapshot, liveWords, pinnedFrozenRound, session]);
  const roundStillActive =
    isLiveSessionForLeftRound(leftAtBaseWordRound, session) && session?.status === 'playing';
  const { lexicon: roundLexicon, loading: lexiconLoading } = useResultsRoundLexicon(
    displaySession,
    archiveLexicon,
  );

  useEffect(() => {
    if (!gameId || displaySession?.baseWordRound == null) {
      return;
    }
    void getFinishedRoundArchive(gameId, displaySession.baseWordRound).then((archive) => {
      setArchiveLexicon(archive?.playableLexicon ?? null);
    });
  }, [displaySession?.baseWordRound, gameId]);

  const rosterPlayerIds = useMemo(() => {
    if (pinnedFrozenRound || !session || !isLiveSessionForLeftRound(leftAtBaseWordRound, session)) {
      return [];
    }
    return Object.keys(session.players).sort();
  }, [leftAtBaseWordRound, pinnedFrozenRound, session]);

  const mergeWords = useCallback((incoming: AllPlayerWords) => {
    setLiveWords((prev) => mergeAllPlayerWords(prev, incoming));
  }, []);

  useEffect(() => {
    void ensureAnonymousAuth().then((user) => {
      setResolvedUid(user.uid);
    });
  }, []);

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
    const round = session.baseWordRound ?? 0;
    setLeftAtBaseWordRound((prev) => {
      if (prev != null) {
        return prev;
      }
      pendingMarkedRoundRef.current = round;
      void markPendingRoundArchive(gameId, round, myUid);
      return round;
    });
  }, [gameId, myUid, rejoinLoading, session?.baseWordRound, session?.status]);

  useEffect(() => {
    if (
      !gameId ||
      leftAtBaseWordRound == null ||
      !session ||
      session.status !== 'playing' ||
      session.baseWordRound !== leftAtBaseWordRound
    ) {
      return;
    }
    setLeftRoundPlayingSnapshot(freezeFinishedRound(gameId, session, liveWords));
  }, [gameId, leftAtBaseWordRound, liveWords, session]);

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
    if (!me || me.hasLeft === true || leaveAttemptedRef.current) {
      return;
    }
    leaveAttemptedRef.current = true;
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
    if (
      !gameId ||
      pinnedFrozenRound ||
      rosterPlayerIds.length === 0 ||
      session?.status !== 'playing'
    ) {
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
  }, [gameId, mergeWords, pinnedFrozenRound, rosterPlayerIds, session?.status]);

  useEffect(() => {
    if (
      !gameId ||
      !myUid ||
      leftAtBaseWordRound == null ||
      !session ||
      !shouldLoadLeftRoundFinishedArchive(leftAtBaseWordRound, session, pinnedFrozenRound != null)
    ) {
      return;
    }
    if (freezeAttemptedRef.current) {
      return;
    }
    freezeAttemptedRef.current = true;
    let cancelled = false;
    void (async () => {
      const archived = await loadFrozenFinishedRoundFromArchive(gameId, leftAtBaseWordRound);
      if (cancelled) {
        return;
      }
      if (
        archived &&
        shouldAcceptLeftRoundFrozenArchive(archived.session.baseWordRound, leftAtBaseWordRound)
      ) {
        setFrozenRound(archived);
        setWordsBootstrapComplete(true);
        return;
      }
      if (!shouldPersistLeftRoundFinishedArchive(leftAtBaseWordRound, session)) {
        freezeAttemptedRef.current = false;
        return;
      }
      try {
        await persistFinishedRoundFromFirebase(gameId, myUid, session);
        if (cancelled) {
          return;
        }
        const refreshed = await loadFrozenFinishedRoundFromArchive(gameId, leftAtBaseWordRound);
        if (
          refreshed &&
          shouldAcceptLeftRoundFrozenArchive(refreshed.session.baseWordRound, leftAtBaseWordRound)
        ) {
          setFrozenRound(refreshed);
          setWordsBootstrapComplete(true);
          finishedArchiveRef.current = true;
        }
      } catch {
        freezeAttemptedRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, leftAtBaseWordRound, myUid, pinnedFrozenRound, session]);

  useEffect(() => {
    if (
      !gameId ||
      !myUid ||
      !pinnedFrozenRound ||
      finishedArchiveRef.current ||
      !shouldPersistLeftRoundFinishedArchive(leftAtBaseWordRound, session)
    ) {
      return;
    }
    finishedArchiveRef.current = true;
    void persistFinishedRoundForPlayer(
      gameId,
      myUid,
      pinnedFrozenRound.session,
      pinnedFrozenRound.words,
    ).catch(() => {
      finishedArchiveRef.current = false;
    });
  }, [gameId, leftAtBaseWordRound, myUid, pinnedFrozenRound, session]);

  useEffect(() => {
    if (
      !gameId ||
      !session ||
      !leftAtBaseWordRound ||
      session.status !== 'finished' ||
      session.baseWordRound !== leftAtBaseWordRound ||
      finishedNotifyRef.current
    ) {
      return;
    }
    const round = session.baseWordRound ?? 0;
    void (async () => {
      const sent = await notifyRoundFinishedOnce(gameId, round, session.baseWord);
      if (sent || (await isRoundFinishedNotified(gameId, round))) {
        finishedNotifyRef.current = true;
      }
    })();
  }, [gameId, leftAtBaseWordRound, session]);

  const viewData = useMemo(() => {
    if (!displaySession || !myUid) {
      return null;
    }
    const raw = buildOnlineResultsView(t, displaySession, wordsSnapshot, { viewerUid: myUid });
    return maskResultsForEarlyExit(raw, myUid, t);
  }, [displaySession, myUid, t, wordsSnapshot]);

  const stillPlaying = useMemo(() => {
    if (!session || !myUid || !roundStillActive) {
      return [];
    }
    return stillPlayingPlayerNames(session, myUid);
  }, [myUid, roundStillActive, session]);

  const canViewResultsNow = shouldShowLeftRoundViewResults({
    roundStillActive,
    displaySessionStatus: displaySession?.status,
    leftAtBaseWordRound,
    liveSession: session,
  });

  useEffect(() => {
    if (canViewResultsNow) {
      setViewResultsUnlocked(true);
    }
  }, [canViewResultsNow]);

  const canViewResults = viewResultsUnlocked || canViewResultsNow;
  const resultsBaseWordRound = resolveLeftRoundResultsBaseWordRound(
    displaySession?.baseWordRound,
    leftAtBaseWordRound,
  );

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
        router.replace(onlineResultsRoute(gameId, leftAtBaseWordRound ?? undefined));
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
  }, [gameId, leftAtBaseWordRound, myUid, t]);

  const handleHome = useCallback(async () => {
    const myWords = wordsSnapshot.get(myUid) ?? new Map<string, StoredPlayerWord>();
    if (roundStillActive && session) {
      void markPendingRoundArchive(gameId, session.baseWordRound ?? 0, myUid);
    } else if (pinnedFrozenRound && !finishedArchiveRef.current) {
      try {
        await persistFinishedRoundForPlayer(
          gameId,
          myUid,
          pinnedFrozenRound.session,
          pinnedFrozenRound.words,
        );
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
      exitedResults:
        session?.status === 'finished' &&
        session.baseWordRound === leftAtBaseWordRound &&
        session.players[myUid]?.hasLeft !== true,
    });
  }, [
    displaySession,
    gameId,
    leftAtBaseWordRound,
    myUid,
    pinnedFrozenRound,
    roundStillActive,
    session,
    wordsSnapshot,
  ]);

  const onBack = useSyncedStackBack(handleHome);

  const leftRoundTitle = useMemo(
    () => tGendered(t, 'game.leftRoundTitle', viewerGender),
    [t, viewerGender],
  );

  const screenOptions = useMemo(
    () => ({
      ...stackHeaderBack(onBack),
      title: leftRoundTitle,
    }),
    [leftRoundTitle, onBack],
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

  if (
    !displaySession ||
    !viewData ||
    (!wordsBootstrapComplete && !pinnedFrozenRound && roundStillActive)
  ) {
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
        baseWordDisplay={viewData.baseWordDisplay}
        totalDistinctWords={viewData.totalDistinctWords}
        maxPlayableWords={roundLexicon?.maxCount ?? null}
        roundLexicon={roundLexicon}
        lexiconLoading={lexiconLoading}
        globalWords={viewData.globalWords}
        playerRankGroups={viewData.playerRankGroups}
        highlightPlayerId={myUid}
        defaultExpandedPlayerId={myUid}
        showScores={viewData.uniqueBonusEnabled}
        showWordAuthors={!viewData.isSolo}
        roundDurationSeconds={viewData.roundDurationSeconds}
        missingWordsToggleDisabled={roundStillActive}
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
            {canViewResults ? (
              <PrimaryButton
                label={t('game.viewResults')}
                onPress={() => {
                  router.replace(onlineResultsRoute(gameId, resultsBaseWordRound));
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
}
