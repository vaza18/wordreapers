import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { OnlineMapsSyncBanner } from '@/components/online/OnlineMapsSyncBanner';
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
import { navigateHomeClearingStack } from '@/lib/navigation/navigate-home';
import { exitOnlineToHome } from '@/lib/online/exit-online-flow';
import { persistLocalArchive } from '@/lib/online/coordinated-session-cleanup';
import { shouldSkipEmptyArchiveWords } from '@/lib/online/session/archive-words-gate';
import { shouldFinalizeOnlineResultsStats } from '@/lib/online/should-finalize-online-results-stats';
import {
  RESULTS_EMPTY_CLAIMS_ESCAPE_MS,
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
  computeResultsMapsRosterPlayerIds,
  nextResultsFreezePending,
  resolveResultsDisplayRound,
  resolveResultsErrorCta,
  resolveResultsFreezeSource,
  shouldCloseResultsRematchSurvival,
  shouldEnableResultsMapsRosterListen,
  shouldUpgradeEmptyResultsFreeze,
  RESULTS_REMATCH_SURVIVAL_EMPTY_CLOSE_GRACE_MS,
  type ResultsFreezePending,
} from '@/lib/online/session/frozen-round-view';
import { totalPlayerWordCount } from '@/lib/online/session/live-words-snapshot';
import {
  createResultsHomePress,
  shouldShowResultsWordsLoadingHomeEscape,
} from '@/lib/online/session/results-home-escape';
import { resolveResultsPresence } from '@/lib/online/live-round-screen-actions';
import { optIntoLiveRound } from '@/lib/online/rematch/opt-into-live-round';
import { resultsRematchFooterMode } from '@/lib/online/results-rematch-footer-mode';
import { parseViewingBaseWordRoundParam } from '@/lib/online/parse-viewing-base-word-round-param';
import { peekFinishedRoundResultsHandoff } from '@/lib/online/session/finished-round-results-handoff';
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
  const [archiveRecoveryPending, setArchiveRecoveryPending] = useState(
    () => viewingBaseWordRound != null,
  );
  const statsRecordedRef = useRef(false);
  const archivedRef = useRef(false);
  const archivePromiseRef = useRef<Promise<void> | null>(null);
  /** freezeAttempted state drives roster gate; ref is SoT for recovery/freeze effects — write only via mark/clear. */
  const freezeAttemptedRef = useRef(false);
  const pendingFreezeRef = useRef<ResultsFreezePending | null>(null);
  /** State (not ref-in-useMemo) so rematch-survival roster recomputes on rematch/freeze. */
  const [lastFinishedCore, setLastFinishedCore] = useState<GameSessionSnapshot | null>(null);
  const [freezeAttempted, setFreezeAttempted] = useState(false);
  /** Always update ref + state together — never assign freezeAttemptedRef alone. */
  const markFreezeAttempted = useCallback(() => {
    freezeAttemptedRef.current = true;
    setFreezeAttempted(true);
  }, []);
  const clearFreezeAttempted = useCallback(() => {
    freezeAttemptedRef.current = false;
    setFreezeAttempted(false);
  }, []);
  const skipRematchToastRef = useRef(false);
  const skipResultsOfflineRef = useRef(false);
  const resultsOfflineMarkedKeyRef = useRef<string | null>(null);
  const viewedResultsLoggedRef = useRef(false);
  const emptyClaimsLoadingSinceRef = useRef<number | null>(null);
  const [emptyClaimsNowMs, setEmptyClaimsNowMs] = useState(() => Date.now());
  /** Rematch-survival: when empty authoritative bootstrap first became a close candidate. */
  const emptySurvivalBootstrapSinceRef = useRef<number | null>(null);
  const [emptySurvivalCloseTick, setEmptySurvivalCloseTick] = useState(0);

  useEffect(() => {
    // FIX: 2026-09 — play→results maps seed before AsyncStorage freeze → memory handoff
    // Peek only (do not clear): React Strict Mode remount must still see the pin.
    const handed = peekFinishedRoundResultsHandoff(gameId, viewingBaseWordRound);
    setFrozenRound(handed);
    emptyClaimsLoadingSinceRef.current = null;
    setEmptyClaimsNowMs(Date.now());
    // Eager pending when a viewing pin is set so we never flash errorRoomNotFound
    // before useFrozenRoundRecovery's effect runs — skip when handoff already froze.
    setArchiveRecoveryPending(viewingBaseWordRound != null && handed == null);
    setRematchError(null);
    setRematchLoading(false);
    setLocalLoadComplete(false);
    setSessionLoaded(false);
    setLiveSessionCore(null);
    statsRecordedRef.current = false;
    archivedRef.current = false;
    archivePromiseRef.current = null;
    clearFreezeAttempted();
    pendingFreezeRef.current = null;
    setLastFinishedCore(null);
    emptySurvivalBootstrapSinceRef.current = null;
    setEmptySurvivalCloseTick(0);
    skipRematchToastRef.current = false;
    skipResultsOfflineRef.current = false;
    resultsOfflineMarkedKeyRef.current = null;
    viewedResultsLoggedRef.current = false;
  }, [clearFreezeAttempted, gameId, viewingBaseWordRound]);

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

  const rosterPlayerIds = useMemo(
    () =>
      computeResultsMapsRosterPlayerIds({
        frozenWords: frozenRound?.words,
        liveSessionCore,
        lastFinishedCore,
        freezeAttempted,
      }),
    [frozenRound, liveSessionCore, lastFinishedCore, freezeAttempted],
  );

  const liveFinishedSameRound =
    liveSessionCore?.status === 'finished' &&
    (viewingBaseWordRound == null || (liveSessionCore.baseWordRound ?? 0) === viewingBaseWordRound);

  const { liveWords, liveWordMaps, wordsBootstrapComplete, mapsUnavailable, retryMapsListen } =
    useLiveRosterPlayerWords({
      gameId,
      rosterPlayerIds,
      enabled: shouldEnableResultsMapsRosterListen({
        hasGameId: Boolean(gameId),
        rosterPlayerIdsLength: rosterPlayerIds.length,
        frozenWords: frozenRound?.words,
        archiveRecoveryPending,
        liveFinishedSameRound,
      }),
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
    if (liveSessionCore?.status === 'finished') {
      setLastFinishedCore(liveSessionCore);
    }
  }, [liveSessionCore]);

  useEffect(() => {
    if (frozenRound) {
      markFreezeAttempted();
    }
  }, [frozenRound, markFreezeAttempted]);

  useEffect(() => {
    pendingFreezeRef.current = nextResultsFreezePending(
      pendingFreezeRef.current,
      liveSession,
      liveWords,
      wordsBootstrapComplete,
      lastFinishedCore,
    );
  }, [liveSession, liveWords, wordsBootstrapComplete, lastFinishedCore]);

  useEffect(() => {
    const pending = pendingFreezeRef.current;
    const closeCandidate =
      !freezeAttempted &&
      !frozenRound &&
      !mapsUnavailable &&
      liveSession?.status === 'waiting' &&
      wordsBootstrapComplete &&
      pending == null &&
      totalPlayerWordCount(liveWords) === 0;

    if (!closeCandidate) {
      emptySurvivalBootstrapSinceRef.current = null;
      return undefined;
    }

    if (emptySurvivalBootstrapSinceRef.current == null) {
      emptySurvivalBootstrapSinceRef.current = Date.now();
    }
    const elapsed = Date.now() - emptySurvivalBootstrapSinceRef.current;

    if (
      shouldCloseResultsRematchSurvival({
        freezeAttempted,
        hasFrozenRound: Boolean(frozenRound),
        liveStatus: liveSession?.status,
        wordsBootstrapComplete,
        liveWords,
        pending,
        emptyBootstrapElapsedMs: elapsed,
        mapsUnavailable,
      })
    ) {
      markFreezeAttempted();
      return undefined;
    }

    const remaining = Math.max(0, RESULTS_REMATCH_SURVIVAL_EMPTY_CLOSE_GRACE_MS - elapsed);
    const timer = setTimeout(() => {
      setEmptySurvivalCloseTick((n) => n + 1);
    }, remaining);
    return () => {
      clearTimeout(timer);
    };
  }, [
    emptySurvivalCloseTick,
    freezeAttempted,
    frozenRound,
    liveSession?.status,
    liveWords,
    mapsUnavailable,
    markFreezeAttempted,
    wordsBootstrapComplete,
  ]);

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
    markFreezeAttempted();
    setFrozenRound(freezeFinishedRound(gameId, source.session, source.words));
  }, [
    archiveRecoveryPending,
    frozenRound,
    gameId,
    liveSession,
    liveWords,
    markFreezeAttempted,
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

  const finishedRoundIndex = session?.baseWordRound ?? frozenRound?.session.baseWordRound ?? 0;
  const footerMode = resultsRematchFooterMode({
    displayBaseWordRound: finishedRoundIndex,
    liveStatus: liveSessionCore?.status ?? lastFinishedCore?.status ?? liveSession?.status ?? null,
    liveBaseWordRound:
      liveSessionCore?.baseWordRound ??
      lastFinishedCore?.baseWordRound ??
      liveSession?.baseWordRound ??
      null,
  });

  const handleRoomLeaders = useCallback(() => {
    router.push({ pathname: '/history/room/[gameId]', params: { gameId } });
  }, [gameId]);

  const navigateHomeOnly = useCallback(() => {
    // Room-not-found: no membership leave, but still flush sticky RTDB diagnostics (ADR-025).
    navigateHomeClearingStack();
  }, []);

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
        <PrimaryButton
          label={t('nav.home')}
          onPress={createResultsHomePress({
            path: 'room-not-found',
            exitOnlineHome: handleHome,
            navigateHomeOnly,
          })}
        />
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
        <PrimaryButton
          label={t('nav.home')}
          onPress={createResultsHomePress({
            path: 'room-not-found',
            exitOnlineHome: handleHome,
            navigateHomeOnly,
          })}
        />
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
        <PrimaryButton
          label={t('nav.home')}
          onPress={createResultsHomePress({
            path: 'room-not-found',
            exitOnlineHome: handleHome,
            navigateHomeOnly,
          })}
        />
      </View>
    );
  }

  const resultsErrorCta = resolveResultsErrorCta({
    viewingBaseWordRound,
    hasFrozenRound: Boolean(frozenRound),
    archiveRecoveryPending,
    sessionLoaded,
    hasFinishedViewData: Boolean(viewData),
    liveStatus: liveSession?.status,
    freezeAttempted,
    lastFinishedCore,
    mapsUnavailable,
  });

  if (resultsErrorCta === 'maps-retry') {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <View style={styles.center}>
          <Text style={styles.error}>{t('online.errorMapsSyncFailed')}</Text>
          <PrimaryButton label={t('online.retryMapsSync')} onPress={retryMapsListen} />
          <PrimaryButton
            label={t('nav.home')}
            variant="secondary"
            onPress={createResultsHomePress({
              path: 'maps-retry',
              exitOnlineHome: handleHome,
              navigateHomeOnly,
            })}
          />
        </View>
      </>
    );
  }

  if (resultsErrorCta === 'rematch-home') {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <View style={styles.center}>
          <Text style={styles.error}>{t('online.errorOpenResultsFailed')}</Text>
          <PrimaryButton
            label={t('nav.home')}
            onPress={createResultsHomePress({
              path: 'rematch-home',
              exitOnlineHome: handleHome,
              navigateHomeOnly,
            })}
          />
        </View>
      </>
    );
  }

  if (
    !viewData ||
    shouldShowOnlineResultsWordsLoading({
      frozenRound,
      wordsBootstrapComplete,
      mapsUnavailable,
      session,
      wordsSnapshot,
      emptyClaimsLoadingSinceMs: emptyClaimsLoadingSinceRef.current,
      nowMs: emptyClaimsNowMs,
    })
  ) {
    const showWordsLoadingHome = shouldShowResultsWordsLoadingHomeEscape({
      hasFinishedViewData: Boolean(viewData),
    });
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          {showWordsLoadingHome ? (
            <>
              <Text style={styles.loadingHint}>{t('online.loadingResultsWords')}</Text>
              <PrimaryButton
                label={t('nav.home')}
                variant="secondary"
                onPress={createResultsHomePress({
                  path: 'words-loading',
                  exitOnlineHome: handleHome,
                  navigateHomeOnly,
                })}
              />
            </>
          ) : null}
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={screenOptions} />
      {mapsUnavailable ? <OnlineMapsSyncBanner onRetry={retryMapsListen} /> : null}
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
            primaryLabel={
              footerMode === 'room_complete'
                ? t('online.roomLeaders')
                : t('game.newGameSamePlayers')
            }
            primaryDisabled={footerMode === 'room_complete' ? false : rematchLoading}
            onPrimaryPress={() => {
              if (footerMode === 'room_complete') {
                handleRoomLeaders();
                return;
              }
              void handlePlayAgain();
            }}
            secondaryLabel={t('nav.home')}
            onSecondaryPress={createResultsHomePress({
              path: 'footer',
              exitOnlineHome: handleHome,
              navigateHomeOnly,
            })}
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
      color: colors.danger,
      fontSize: 14,
      textAlign: 'center',
    },
    loadingHint: {
      color: colors.textSecondary,
      fontSize: 14,
      textAlign: 'center',
    },
  });
}
