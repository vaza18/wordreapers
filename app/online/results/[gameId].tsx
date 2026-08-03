import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { PlaySessionToastStack } from '@/components/PlaySessionToast';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RoundResultsFooterActions } from '@/components/RoundResultsFooterActions';
import { RoundResultsView } from '@/components/RoundResultsView';
import { isViewerWinner } from '@/lib/game/is-viewer-winner';
import { useResultsRematchToast } from '@/hooks/useResultsRematchToast';
import { useLiveRosterPlayerWords } from '@/hooks/useLiveRosterPlayerWords';
import { useOnlineViewerUid } from '@/hooks/useOnlineViewerUid';
import { useResultsRoundLexicon } from '@/hooks/useResultsRoundLexicon';
import { StackHeaderTitle } from '@/components/StackHeaderTitle';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import {
  markPlayerOffline,
  removeOrphanGameSessionShell,
  subscribeGameSession,
  type GameSessionSnapshot,
} from '@/lib/firebase/game-session-service';
import { exitOnlineToHome } from '@/lib/online/exit-online-flow';
import { persistLocalArchive } from '@/lib/online/coordinated-session-cleanup';
import { shouldSkipEmptyArchiveWords } from '@/lib/online/session/archive-words-gate';
import { shouldFinalizeOnlineResultsStats } from '@/lib/online/should-finalize-online-results-stats';
import {
  RESULTS_EMPTY_CLAIMS_ESCAPE_MS,
  RESULTS_WORDS_BOOTSTRAP_ESCAPE_MS,
  shouldShowOnlineResultsWordsLoading,
} from '@/lib/online/session/should-show-online-results-words-loading';
import {
  freezeFinishedRound,
  type FrozenFinishedRound,
} from '@/lib/online/session/frozen-finished-round';
import { finalizeOnlineRoundForPlayer } from '@/lib/online/finalize-online-round';
import {
  getFinishedRoundArchive,
  isFinishedArchiveStale,
} from '@/lib/online/session/online-session-archive';
import { buildDisplaysByPlayer, buildOnlineResultsView } from '@/lib/online/online-results-data';
import {
  mergeLiveSessionForResults,
  nextResultsFreezePending,
  resolveResultsDisplayRound,
  resolveResultsFreezeSource,
  shouldShowResultsUnavailableAfterRematch,
  shouldUpgradeEmptyResultsFreeze,
  type ResultsFreezePending,
} from '@/lib/online/session/frozen-round-view';
import { resolveResultsPresence } from '@/lib/online/live-round-screen-actions';
import { optIntoLiveRound } from '@/lib/online/rematch/opt-into-live-round';
import { parseViewingBaseWordRoundParam } from '@/lib/online/parse-viewing-base-word-round-param';
import type { RoundResultsViewData } from '@/lib/online/online-results-data';
import { useSyncedStackBack } from '@/hooks/useSyncedStackBack';
import { useFrozenRoundRecovery } from '@/hooks/useFrozenRoundRecovery';

import { stackHeaderBack } from '@/lib/navigation/stack-header-options';
import { useProfileStore } from '@/store/profile-store';
import { devLogAction } from '@/lib/debug/dev-log';

/**
 * Online round results — local archive first, Firebase only for rematch routing and cleanup.
 */
export default function OnlineResultsScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const {
    gameId: rawGameId,
    baseWordRound: rawViewingRound,
    fromJoin: rawFromJoin,
  } = useLocalSearchParams<{
    gameId: string;
    baseWordRound?: string;
    fromJoin?: string;
  }>();
  const gameId = rawGameId ?? '';
  const viewingBaseWordRound = useMemo(
    () => parseViewingBaseWordRoundParam(rawViewingRound),
    [rawViewingRound],
  );
  const fromJoinIntoPlaying = rawFromJoin === '1';
  const myUid = useOnlineViewerUid();

  const [liveSessionCore, setLiveSessionCore] = useState<GameSessionSnapshot | null>(null);
  const [frozenRound, setFrozenRound] = useState<FrozenFinishedRound | null>(null);
  const [localLoadComplete, setLocalLoadComplete] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [rematchLoading, setRematchLoading] = useState(false);
  const [rematchError, setRematchError] = useState<string | null>(null);
  const [archiveRecoveryPending, setArchiveRecoveryPending] = useState(false);
  const statsRecordedRef = useRef(false);
  const archivedRef = useRef(false);
  const archivePromiseRef = useRef<Promise<void> | null>(null);
  const freezeAttemptedRef = useRef(false);
  const pendingFreezeRef = useRef<ResultsFreezePending | null>(null);
  const skipRematchToastRef = useRef(false);
  const skipResultsOfflineRef = useRef(false);
  const resultsOfflineMarkedKeyRef = useRef<string | null>(null);
  const viewedResultsLoggedRef = useRef(false);
  const emptyClaimsLoadingSinceRef = useRef<number | null>(null);
  const bootstrapLoadingSinceRef = useRef<number | null>(null);
  const [emptyClaimsNowMs, setEmptyClaimsNowMs] = useState(() => Date.now());

  useEffect(() => {
    setFrozenRound(null);
    emptyClaimsLoadingSinceRef.current = null;
    bootstrapLoadingSinceRef.current = null;
    setEmptyClaimsNowMs(Date.now());
    // Eager pending when a viewing pin is set so we never flash errorRoomNotFound
    // before useFrozenRoundRecovery's effect runs.
    setArchiveRecoveryPending(viewingBaseWordRound != null);
    setRematchError(null);
    setRematchLoading(false);
    setLocalLoadComplete(false);
    setSessionLoaded(false);
    setLiveSessionCore(null);
    statsRecordedRef.current = false;
    archivedRef.current = false;
    archivePromiseRef.current = null;
    freezeAttemptedRef.current = false;
    pendingFreezeRef.current = null;
    skipRematchToastRef.current = false;
    skipResultsOfflineRef.current = false;
    resultsOfflineMarkedKeyRef.current = null;
    viewedResultsLoggedRef.current = false;
  }, [gameId, viewingBaseWordRound]);

  useEffect(() => {
    if (viewedResultsLoggedRef.current || !gameId) {
      return;
    }
    viewedResultsLoggedRef.current = true;
    devLogAction('viewing round results', {
      room: gameId,
      round: viewingBaseWordRound ?? undefined,
      details: fromJoinIntoPlaying ? 'from mid-round join' : undefined,
    });
  }, [fromJoinIntoPlaying, gameId, viewingBaseWordRound]);

  const rosterPlayerIds = useMemo(() => {
    if (frozenRound || !liveSessionCore || liveSessionCore.status !== 'finished') {
      return [];
    }
    return Object.keys(liveSessionCore.players).sort();
  }, [frozenRound, liveSessionCore]);

  const { liveWords, liveWordMaps, wordsBootstrapComplete } = useLiveRosterPlayerWords({
    gameId,
    rosterPlayerIds,
    enabled: Boolean(gameId && !frozenRound && rosterPlayerIds.length > 0),
  });

  const liveSession = useMemo(
    () => mergeLiveSessionForResults(liveSessionCore, liveWordMaps, Boolean(frozenRound)),
    [frozenRound, liveSessionCore, liveWordMaps],
  );
  const rematchToasts = useResultsRematchToast(liveSession, myUid, skipRematchToastRef);

  const displayRound = useMemo(
    () =>
      resolveResultsDisplayRound({
        frozenRound,
        liveSession,
        liveWords,
        viewingBaseWordRound,
      }),
    [frozenRound, liveSession, liveWords, viewingBaseWordRound],
  );
  const session = displayRound?.session ?? null;
  const wordsSnapshot = useMemo(
    () => displayRound?.words ?? new Map<string, string[]>(),
    [displayRound],
  );
  const { lexicon: roundLexicon, loading: lexiconLoading } = useResultsRoundLexicon(session, {
    gameId,
    baseWordRound: session?.baseWordRound,
  });

  const ensureArchived = useCallback(async (): Promise<void> => {
    if (archivedRef.current) {
      return;
    }
    // Do not require frozenRound: empty+claims escape may show results without a freeze.
    if (!session || session.status !== 'finished' || !myUid) {
      return;
    }
    const baseWordRound = session.baseWordRound ?? 0;
    const existing = await getFinishedRoundArchive(gameId, baseWordRound);
    if (existing?.ackSent === true && !isFinishedArchiveStale(existing, session)) {
      archivedRef.current = true;
      return;
    }
    if (!archivePromiseRef.current) {
      archivePromiseRef.current = persistLocalArchive(gameId, myUid, session, wordsSnapshot)
        .then((result) => {
          if (result === 'saved') {
            archivedRef.current = true;
            return;
          }
          // Soft-skip empty+claims — allow a later retry when maps arrive.
          archivePromiseRef.current = null;
        })
        .catch((error) => {
          archivePromiseRef.current = null;
          throw error;
        });
    }
    await archivePromiseRef.current;
  }, [gameId, myUid, session, wordsSnapshot]);

  useEffect(() => {
    setLocalLoadComplete(true);
  }, [gameId]);

  useFrozenRoundRecovery({
    gameId,
    sessionLoaded,
    frozenRound,
    setFrozenRound,
    liveSession,
    viewingBaseWordRound,
    freezeAttemptedRef,
    archivedRef,
    setArchiveRecoveryPending,
    fromJoinIntoPlaying,
  });

  // When a later round finishes in RTDB, keep the frozen snapshot the player is reviewing.
  // See shouldKeepFrozenResultsOverLiveFinished — do not clear frozenRound on live updates.

  useEffect(() => {
    if (!gameId) {
      return undefined;
    }
    const unsubSession = subscribeGameSession(gameId, (next) => {
      setLiveSessionCore(next);
      setSessionLoaded(true);
    });
    return () => {
      unsubSession();
    };
  }, [gameId]);

  useEffect(() => {
    if (!sessionLoaded || liveSession || archiveRecoveryPending || frozenRound) {
      return;
    }
    if (myUid) {
      void markPlayerOffline(gameId, myUid).then(() => removeOrphanGameSessionShell(gameId, myUid));
    }
  }, [archiveRecoveryPending, frozenRound, gameId, liveSession, myUid, sessionLoaded]);

  useEffect(() => {
    pendingFreezeRef.current = nextResultsFreezePending(
      pendingFreezeRef.current,
      liveSession,
      liveWords,
      wordsBootstrapComplete,
    );
  }, [liveSession, liveWords, wordsBootstrapComplete]);

  useEffect(() => {
    if (
      frozenRound &&
      liveSession?.status === 'finished' &&
      shouldUpgradeEmptyResultsFreeze({
        frozenWords: frozenRound.words,
        nextWords: liveWords,
        frozenBaseWordRound: frozenRound.session.baseWordRound ?? 0,
        liveBaseWordRound: liveSession.baseWordRound ?? 0,
        viewingBaseWordRound,
      })
    ) {
      setFrozenRound(freezeFinishedRound(gameId, liveSession, liveWords));
      return;
    }
    if (freezeAttemptedRef.current || frozenRound || archiveRecoveryPending) {
      return;
    }
    const source = resolveResultsFreezeSource({
      hasFrozenRound: false,
      liveSession,
      liveWords,
      wordsBootstrapComplete,
      viewingBaseWordRound,
      pending: pendingFreezeRef.current,
    });
    if (!source) {
      return;
    }
    freezeAttemptedRef.current = true;
    setFrozenRound(freezeFinishedRound(gameId, source.session, source.words));
  }, [
    archiveRecoveryPending,
    frozenRound,
    gameId,
    liveSession,
    liveWords,
    viewingBaseWordRound,
    wordsBootstrapComplete,
  ]);

  const viewData = useMemo((): RoundResultsViewData | null => {
    if (!session || session.status !== 'finished') {
      return null;
    }
    return buildOnlineResultsView(t, session, wordsSnapshot, {
      viewerUid: myUid,
      displaysByPlayer: buildDisplaysByPlayer(wordsSnapshot, roundLexicon?.displays),
    });
  }, [myUid, roundLexicon?.displays, session, t, wordsSnapshot]);

  const emptyClaimsLoading =
    !frozenRound &&
    wordsBootstrapComplete &&
    session?.status === 'finished' &&
    shouldSkipEmptyArchiveWords(session, wordsSnapshot);

  useEffect(() => {
    if (!emptyClaimsLoading) {
      emptyClaimsLoadingSinceRef.current = null;
      return undefined;
    }
    if (emptyClaimsLoadingSinceRef.current == null) {
      emptyClaimsLoadingSinceRef.current = Date.now();
    }
    const since = emptyClaimsLoadingSinceRef.current;
    const remaining = Math.max(0, RESULTS_EMPTY_CLAIMS_ESCAPE_MS - (Date.now() - since));
    const id = setTimeout(() => setEmptyClaimsNowMs(Date.now()), remaining);
    return () => clearTimeout(id);
  }, [emptyClaimsLoading]);

  const waitingBootstrap = !frozenRound && !wordsBootstrapComplete;
  useEffect(() => {
    if (!waitingBootstrap) {
      bootstrapLoadingSinceRef.current = null;
      return undefined;
    }
    if (bootstrapLoadingSinceRef.current == null) {
      bootstrapLoadingSinceRef.current = Date.now();
    }
    const since = bootstrapLoadingSinceRef.current;
    const remaining = Math.max(0, RESULTS_WORDS_BOOTSTRAP_ESCAPE_MS - (Date.now() - since));
    const id = setTimeout(() => setEmptyClaimsNowMs(Date.now()), remaining);
    return () => clearTimeout(id);
  }, [waitingBootstrap]);

  const emptyClaimsEscaped =
    emptyClaimsLoadingSinceRef.current != null &&
    emptyClaimsNowMs - emptyClaimsLoadingSinceRef.current >= RESULTS_EMPTY_CLAIMS_ESCAPE_MS;

  useEffect(() => {
    if (
      !viewData ||
      !session ||
      session.status !== 'finished' ||
      !myUid ||
      statsRecordedRef.current
    ) {
      return;
    }
    if (
      !shouldFinalizeOnlineResultsStats({
        frozenRound,
        emptyClaimsEscaped,
        session,
        wordsSnapshot,
      })
    ) {
      return;
    }
    statsRecordedRef.current = true;
    const round = session.baseWordRound ?? 0;
    const standings = viewData.standings;
    void (async () => {
      try {
        await finalizeOnlineRoundForPlayer(gameId, round, myUid, standings);
      } catch (error) {
        if (__DEV__) {
          console.warn('finalizeOnlineRoundForPlayer', error);
        }
      }
      try {
        await ensureArchived();
      } catch (error) {
        if (__DEV__) {
          console.warn('ensureArchived', error);
        }
      }
    })();
  }, [
    emptyClaimsEscaped,
    ensureArchived,
    frozenRound,
    gameId,
    myUid,
    session,
    viewData,
    wordsSnapshot,
  ]);

  // Maps may arrive after escape — retry archive once freeze lands.
  useEffect(() => {
    if (!frozenRound || !myUid || !session || session.status !== 'finished') {
      return;
    }
    void ensureArchived().catch((error) => {
      if (__DEV__) {
        console.warn('ensureArchived after freeze', error);
      }
    });
  }, [ensureArchived, frozenRound, myUid, session]);

  useEffect(() => {
    if (!gameId || !myUid || skipResultsOfflineRef.current) {
      return;
    }
    const frozenRoundNum = frozenRound?.session.baseWordRound ?? viewingBaseWordRound ?? null;
    if (!resolveResultsPresence({ liveSession, frozenBaseWordRound: frozenRoundNum })) {
      return;
    }
    // Mark offline once per room/round — re-firing on every liveSession tick races
    // rematch `finished → waiting` writes (and used to abort whole-session txs).
    const offlineKey = `${gameId}:${frozenRoundNum ?? 'none'}`;
    if (resultsOfflineMarkedKeyRef.current === offlineKey) {
      return;
    }
    resultsOfflineMarkedKeyRef.current = offlineKey;
    void markPlayerOffline(gameId, myUid);
  }, [frozenRound, gameId, liveSession, myUid, viewingBaseWordRound]);

  const isOrganizer = session?.organizerId === myUid;

  const handlePlayAgain = useCallback(async () => {
    setRematchError(null);
    setRematchLoading(true);
    skipRematchToastRef.current = true;
    skipResultsOfflineRef.current = true;
    try {
      const baseWordRound = session?.baseWordRound ?? frozenRound?.session.baseWordRound ?? 0;
      const { name, gender, avatarColorIndex } = useProfileStore.getState();
      const route = await optIntoLiveRound(
        gameId,
        myUid,
        { name, gender, avatarColorIndex },
        baseWordRound,
      );
      setRematchLoading(false);
      if (route.pathname === '/online/lobby/[gameId]') {
        router.replace({ ...route, params: { ...route.params, optedIn: '1' } });
      } else {
        router.replace(route);
      }
    } catch (error) {
      skipRematchToastRef.current = false;
      skipResultsOfflineRef.current = false;
      devLogAction('play again / rematch failed', {
        level: 'error',
        room: gameId,
        round: session?.baseWordRound ?? frozenRound?.session.baseWordRound,
        details: error instanceof Error ? error.message : String(error),
      });
      setRematchError(t('online.errorRematchFailed'));
      setRematchLoading(false);
    }
  }, [frozenRound?.session.baseWordRound, gameId, myUid, session?.baseWordRound, t]);

  const handleHome = useCallback(() => {
    void exitOnlineToHome({
      gameId,
      uid: myUid,
      isOrganizer: isOrganizer ?? false,
      sessionStatus: session?.status ?? 'finished',
      session,
      wordsForArchive: frozenRound ? wordsSnapshot : undefined,
      exitedResults: session?.status === 'finished',
    });
  }, [frozenRound, gameId, isOrganizer, myUid, session, wordsSnapshot]);

  const onBack = useSyncedStackBack(handleHome);

  const headerRoundNumber = (session?.baseWordRound ?? viewingBaseWordRound ?? 0) + 1;

  const screenOptions = useMemo(
    () => ({
      ...stackHeaderBack(onBack),
      headerTitle: () =>
        viewData ? (
          <StackHeaderTitle
            title={viewData.baseWordDisplay}
            subtitle={t('history.roomCodeWithRound', {
              code: gameId,
              round: headerRoundNumber,
            })}
          />
        ) : (
          <StackHeaderTitle title={t('online.resultsTitle')} />
        ),
      headerTitleAlign: 'center' as const,
    }),
    [gameId, headerRoundNumber, onBack, t, viewData],
  );

  if (!gameId) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{t('online.errorRoomNotFound')}</Text>
        <PrimaryButton label={t('nav.home')} onPress={() => router.replace('/')} />
      </View>
    );
  }

  if (!localLoadComplete || !myUid) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!session && !frozenRound && sessionLoaded && !liveSession) {
    if (archiveRecoveryPending) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      );
    }
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{t('online.errorRoomNotFound')}</Text>
        <PrimaryButton label={t('nav.home')} onPress={() => router.replace('/')} />
      </View>
    );
  }

  if (
    viewingBaseWordRound != null &&
    !frozenRound &&
    !displayRound &&
    sessionLoaded &&
    !archiveRecoveryPending
  ) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{t('online.errorRoomNotFound')}</Text>
        <PrimaryButton label={t('nav.home')} onPress={() => router.replace('/')} />
      </View>
    );
  }

  if (
    viewingBaseWordRound == null &&
    shouldShowResultsUnavailableAfterRematch({
      hasFrozenRound: Boolean(frozenRound),
      archiveRecoveryPending,
      sessionLoaded,
      hasFinishedViewData: Boolean(viewData),
      liveStatus: liveSession?.status,
    })
  ) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{t('online.errorOpenResultsFailed')}</Text>
        <PrimaryButton label={t('nav.home')} onPress={() => router.replace('/')} />
      </View>
    );
  }

  if (
    !viewData ||
    shouldShowOnlineResultsWordsLoading({
      frozenRound,
      wordsBootstrapComplete,
      session,
      wordsSnapshot,
      emptyClaimsLoadingSinceMs: emptyClaimsLoadingSinceRef.current,
      bootstrapLoadingSinceMs: bootstrapLoadingSinceRef.current,
      nowMs: emptyClaimsNowMs,
    })
  ) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <RoundResultsView
        headline={viewData.headline}
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
        allowProperNouns={viewData.allowProperNouns}
        allowSlang={viewData.allowSlang}
        roundDurationSeconds={viewData.roundDurationSeconds}
        winnerOverride={!viewData.isSolo && isViewerWinner(viewData.playerRankGroups, myUid)}
        footer={
          <RoundResultsFooterActions
            primaryLabel={t('game.newGameSamePlayers')}
            primaryDisabled={rematchLoading}
            onPrimaryPress={() => {
              void handlePlayAgain();
            }}
            secondaryLabel={t('nav.home')}
            onSecondaryPress={() => {
              void handleHome();
            }}
            topContent={rematchError ? <Text style={styles.error}>{rematchError}</Text> : null}
          />
        }
      />
      <PlaySessionToastStack toasts={rematchToasts} topOffset={spacing.md} />
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
      padding: 24,
      gap: 16,
    },
    error: {
      color: '#E24B4A',
      fontSize: 14,
      textAlign: 'center',
    },
  });
}
