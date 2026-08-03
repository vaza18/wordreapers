import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { RoundResultsView } from '@/components/RoundResultsView';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useLiveRosterPlayerWords } from '@/hooks/useLiveRosterPlayerWords';
import { useOnlineViewerUid } from '@/hooks/useOnlineViewerUid';
import { useResultsRoundLexicon } from '@/hooks/useResultsRoundLexicon';
import { useSyncedStackBack } from '@/hooks/useSyncedStackBack';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import {
  leaveGameSession,
  subscribeGameSession,
  type GameSessionSnapshot,
} from '@/lib/firebase/game-session-service';
import {
  persistFinishedRoundForPlayer,
  persistFinishedRoundFromFirebase,
} from '@/lib/online/session/complete-pending-round-archive';
import { exitOnlineToHome } from '@/lib/online/exit-online-flow';
import { normalizeRoomCode } from '@/lib/firebase/room-code';
import { sessionWithWordPlayersForExit } from '@/lib/online/session/session-with-word-players-for-exit';
import {
  clearLeftOnlineResume,
  loadLeftOnlineResume,
  syncLeftOnlineResumePointer,
} from '@/lib/online/session/left-online-resume';
import { clearPausedOnlineResume } from '@/lib/online/session/paused-online-resume';
import {
  freezeFinishedRound,
  loadFrozenFinishedRoundFromArchive,
  type FrozenFinishedRound,
} from '@/lib/online/session/frozen-finished-round';
import { markPendingRoundArchive } from '@/lib/online/session/pending-round-archive';
import {
  liveWordsSignature as liveWordsContentSignature,
  totalPlayerWordCount,
} from '@/lib/online/session/live-words-snapshot';
import { maskResultsForEarlyExit } from '@/lib/online/mask-results-for-viewer';
import { buildDisplaysByPlayer, buildOnlineResultsView } from '@/lib/online/online-results-data';
import { sessionBaseWordDisplay } from '@/lib/online/session-base-word-display';
import { onlineResultsRoute } from '@/lib/online/online-results-route';
import {
  isLiveSessionForLeftRound,
  nextLeftAtAfterResumePointer,
  nextLeftAtBaseWordRound,
  resolveLeftRoundDisplaySession,
  resolveLeftRoundResultsBaseWordRound,
  resolveLeftWordsSnapshot,
  shouldAcceptLeftRoundFrozenArchive,
  shouldFreezeLeftRoundFromPlayingSnapshot,
  shouldLoadLeftRoundFinishedArchive,
  shouldPersistLeftRoundFinishedArchive,
  shouldPromoteLeftPlayingSnapshotFallback,
  shouldShowLeftRoundViewResults,
  type LeftAtRoundSource,
} from '@/lib/online/left-round-screen-actions';
import { resolvePostJoinRouteWithMaps } from '@/lib/online/post-join-route-with-maps';
import { rejoinOnlineRound } from '@/lib/online/session/rejoin-online-round';
import { stillPlayingPlayerNames } from '@/lib/online/presence/active-round-players';
import {
  notifyRoundFinishedOnce,
  isRoundFinishedNotified,
} from '@/lib/online/round-finished-notification-once';
import { stackHeaderBack } from '@/lib/navigation/stack-header-options';
import { tGendered } from '@/lib/game/grammar';
import { useProfileStore } from '@/store/profile-store';

/**
 * Summary after leaving an active online round — live RTDB while playing, local snapshot when finished.
 */
export default function OnlineLeftRoundScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { gameId: rawGameId } = useLocalSearchParams<{ gameId: string }>();
  const gameId = rawGameId ?? '';
  const myUid = useOnlineViewerUid();
  const viewerGender = useProfileStore((state) => state.gender);

  const [session, setSession] = useState<GameSessionSnapshot | null>(null);
  const [frozenRound, setFrozenRound] = useState<FrozenFinishedRound | null>(null);
  const [leftAtBaseWordRound, setLeftAtBaseWordRound] = useState<number | null>(null);
  const [leftRoundPlayingSnapshot, setLeftRoundPlayingSnapshot] =
    useState<FrozenFinishedRound | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [rejoinLoading, setRejoinLoading] = useState(false);
  const [rejoinError, setRejoinError] = useState<string | null>(null);
  const [viewResultsUnlocked, setViewResultsUnlocked] = useState(false);
  const skipAutoLeaveRef = useRef(false);
  const leaveAttemptedRef = useRef(false);
  const finishedArchiveRef = useRef(false);
  const finishedNotifyRef = useRef(false);
  const freezeAttemptedRef = useRef(false);
  const pendingMarkedRoundRef = useRef<number | null>(null);
  const leftAtSourceRef = useRef<LeftAtRoundSource>('none');
  const resumeRoundRef = useRef<number | null>(null);

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
  const roundStillActive =
    isLiveSessionForLeftRound(leftAtBaseWordRound, session) && session?.status === 'playing';

  const rosterPlayerIds = useMemo(() => {
    if (pinnedFrozenRound || !session || !isLiveSessionForLeftRound(leftAtBaseWordRound, session)) {
      return [];
    }
    return Object.keys(session.players).sort();
  }, [leftAtBaseWordRound, pinnedFrozenRound, session]);

  const { liveWords, liveWordMaps, wordsBootstrapComplete } = useLiveRosterPlayerWords({
    gameId,
    rosterPlayerIds,
    enabled: Boolean(
      gameId && !pinnedFrozenRound && rosterPlayerIds.length > 0 && session?.status === 'playing',
    ),
  });

  const wordsSnapshot = useMemo(
    () =>
      resolveLeftWordsSnapshot({
        leftAtBaseWordRound,
        liveSession: session,
        liveWords,
        playingSnapshot: leftRoundPlayingSnapshot,
        pinnedFrozenWords: pinnedFrozenRound?.words ?? null,
      }),
    [leftAtBaseWordRound, leftRoundPlayingSnapshot, liveWords, pinnedFrozenRound, session],
  );

  const { lexicon: roundLexicon, loading: lexiconLoading } = useResultsRoundLexicon(
    displaySession,
    {
      gameId,
      baseWordRound: displaySession?.baseWordRound,
    },
  );

  useEffect(() => {
    leftAtSourceRef.current = 'none';
    resumeRoundRef.current = null;
    setLeftAtBaseWordRound(null);
    setFrozenRound(null);
    setLeftRoundPlayingSnapshot(null);
    setViewResultsUnlocked(false);
    freezeAttemptedRef.current = false;
    finishedArchiveRef.current = false;
    finishedNotifyRef.current = false;
    leaveAttemptedRef.current = false;
    pendingMarkedRoundRef.current = null;
  }, [gameId]);

  useEffect(() => {
    if (!gameId) {
      return;
    }
    void (async () => {
      const pointer = await loadLeftOnlineResume();
      if (!pointer || normalizeRoomCode(pointer.gameId) !== normalizeRoomCode(gameId)) {
        return;
      }
      resumeRoundRef.current = pointer.baseWordRound;
      setLeftAtBaseWordRound((prev) => {
        const next = nextLeftAtAfterResumePointer({
          previous: prev,
          previousSource: leftAtSourceRef.current,
          resumeRound: pointer.baseWordRound,
        });
        if (next.round !== prev) {
          // Pin moved (e.g. live N+1 → resume N); clear stale freeze outside this updater.
          queueMicrotask(() => {
            setFrozenRound(null);
            setLeftRoundPlayingSnapshot(null);
            setViewResultsUnlocked(false);
            freezeAttemptedRef.current = false;
            finishedArchiveRef.current = false;
            finishedNotifyRef.current = false;
          });
        }
        leftAtSourceRef.current = next.source;
        return next.round;
      });
    })();
  }, [gameId]);

  useEffect(() => {
    if (!session) {
      return;
    }
    const next = nextLeftAtBaseWordRound({
      previous: leftAtBaseWordRound,
      previousSource: leftAtSourceRef.current,
      liveStatus: session.status,
      liveRound: session.baseWordRound ?? 0,
      resumeRound: resumeRoundRef.current,
    });
    if (next.round === leftAtBaseWordRound && next.source === leftAtSourceRef.current) {
      return;
    }
    if (next.round != null && next.round !== leftAtBaseWordRound) {
      setFrozenRound(null);
      setLeftRoundPlayingSnapshot(null);
      setViewResultsUnlocked(false);
      freezeAttemptedRef.current = false;
      finishedArchiveRef.current = false;
      finishedNotifyRef.current = false;
    }
    leftAtSourceRef.current = next.source;
    setLeftAtBaseWordRound(next.round);
  }, [leftAtBaseWordRound, session]);

  useEffect(() => {
    if (
      skipAutoLeaveRef.current ||
      rejoinLoading ||
      !gameId ||
      !myUid ||
      session?.status !== 'playing' ||
      leftAtBaseWordRound == null
    ) {
      return;
    }
    const round = session.baseWordRound ?? 0;
    if (leftAtBaseWordRound !== round) {
      return;
    }
    if (pendingMarkedRoundRef.current !== round) {
      pendingMarkedRoundRef.current = round;
      void markPendingRoundArchive(gameId, round, myUid);
    }
  }, [gameId, leftAtBaseWordRound, myUid, rejoinLoading, session?.baseWordRound, session?.status]);

  useEffect(() => {
    if (!gameId || !myUid || leftAtBaseWordRound == null || !session?.players[myUid]) {
      return;
    }
    void clearPausedOnlineResume();
    void syncLeftOnlineResumePointer(gameId, myUid, leftAtBaseWordRound, session);
  }, [gameId, leftAtBaseWordRound, myUid, session]);

  const liveWordsSignature = useMemo(() => liveWordsContentSignature(liveWords), [liveWords]);

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
  }, [gameId, leftAtBaseWordRound, liveWords, liveWordsSignature, session]);

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
        return;
      }
      if (
        shouldFreezeLeftRoundFromPlayingSnapshot({
          leftAtBaseWordRound,
          liveSession: session,
          hasPinnedFrozen: false,
          playingSnapshotBaseWordRound: leftRoundPlayingSnapshot?.session.baseWordRound,
          playingSnapshotHasWords:
            leftRoundPlayingSnapshot != null &&
            totalPlayerWordCount(leftRoundPlayingSnapshot.words) > 0,
        }) &&
        leftRoundPlayingSnapshot
      ) {
        const promoted = freezeFinishedRound(
          gameId,
          { ...leftRoundPlayingSnapshot.session, status: 'finished' },
          leftRoundPlayingSnapshot.words,
        );
        setFrozenRound(promoted);
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
          finishedArchiveRef.current = true;
          return;
        }
        if (shouldPromoteLeftPlayingSnapshotFallback(leftRoundPlayingSnapshot?.words)) {
          const promoted = freezeFinishedRound(
            gameId,
            { ...leftRoundPlayingSnapshot!.session, status: 'finished' },
            leftRoundPlayingSnapshot!.words,
          );
          setFrozenRound(promoted);
          return;
        }
        // Soft maps miss / archive not yet readable — allow another attempt.
        freezeAttemptedRef.current = false;
      } catch {
        if (shouldPromoteLeftPlayingSnapshotFallback(leftRoundPlayingSnapshot?.words)) {
          const promoted = freezeFinishedRound(
            gameId,
            { ...leftRoundPlayingSnapshot!.session, status: 'finished' },
            leftRoundPlayingSnapshot!.words,
          );
          setFrozenRound(promoted);
          return;
        }
        freezeAttemptedRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, leftAtBaseWordRound, leftRoundPlayingSnapshot, myUid, pinnedFrozenRound, session]);

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
      const sent = await notifyRoundFinishedOnce(gameId, round, sessionBaseWordDisplay(session));
      if (sent || (await isRoundFinishedNotified(gameId, round))) {
        finishedNotifyRef.current = true;
      }
    })();
  }, [gameId, leftAtBaseWordRound, session]);

  const viewData = useMemo(() => {
    if (!displaySession || !myUid) {
      return null;
    }
    const raw = buildOnlineResultsView(t, displaySession, wordsSnapshot, {
      viewerUid: myUid,
      displaysByPlayer: buildDisplaysByPlayer(wordsSnapshot, roundLexicon?.displays),
    });
    return maskResultsForEarlyExit(raw, myUid, t);
  }, [displaySession, myUid, roundLexicon?.displays, t, wordsSnapshot]);

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

  const handleViewResults = useCallback(async () => {
    if (!gameId) {
      return;
    }
    const source =
      pinnedFrozenRound ??
      (leftRoundPlayingSnapshot &&
      (leftRoundPlayingSnapshot.session.baseWordRound ?? 0) === leftAtBaseWordRound
        ? freezeFinishedRound(
            gameId,
            { ...leftRoundPlayingSnapshot.session, status: 'finished' },
            leftRoundPlayingSnapshot.words,
          )
        : null);
    if (source && myUid && !finishedArchiveRef.current) {
      try {
        await persistFinishedRoundForPlayer(gameId, myUid, source.session, source.words);
        finishedArchiveRef.current = true;
      } catch (error) {
        if (__DEV__) {
          console.warn('handleViewResults persist archive', error);
        }
      }
    }
    router.replace(onlineResultsRoute(gameId, resultsBaseWordRound));
  }, [
    gameId,
    leftAtBaseWordRound,
    leftRoundPlayingSnapshot,
    myUid,
    pinnedFrozenRound,
    resultsBaseWordRound,
  ]);

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
      await clearLeftOnlineResume();
      router.replace(await resolvePostJoinRouteWithMaps(joined, myUid, gameId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'ROUND_ALREADY_FINISHED') {
        await clearLeftOnlineResume();
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
    const myWords = wordsSnapshot.get(myUid) ?? [];
    const sessionForExit =
      session?.status === 'playing'
        ? sessionWithWordPlayersForExit(session, {
            wordPlayers: liveWordMaps?.wordPlayers,
            ownUid: myUid,
            ownWords: myWords,
          })
        : (displaySession ?? session);
    await exitOnlineToHome({
      gameId,
      uid: myUid,
      isOrganizer: session?.organizerId === myUid,
      sessionStatus: session?.status ?? 'playing',
      session: sessionForExit,
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
    liveWordMaps,
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
        showBaseWordInMeta
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
        allowProperNouns={viewData.allowProperNouns}
        allowSlang={viewData.allowSlang}
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
                  void handleViewResults();
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
