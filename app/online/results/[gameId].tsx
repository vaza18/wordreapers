import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { PlaySessionToastStack } from '@/components/PlaySessionToast';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RoundResultsView } from '@/components/RoundResultsView';
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
import { isSessionWordsSnapshotReady } from '@/lib/online/session-words-bootstrap';
import { freezeFinishedRound, type FrozenFinishedRound } from '@/lib/online/frozen-finished-round';
import { finalizeOnlineRoundForPlayer } from '@/lib/online/finalize-online-round';
import {
  getFinishedRoundArchive,
  isFinishedArchiveStale,
} from '@/lib/online/online-session-archive';
import { buildOnlineResultsView } from '@/lib/online/online-results-data';
import { shouldFreezeLiveFinishedOnResults } from '@/lib/online/frozen-round-view';
import { resolveResultsPresence } from '@/lib/online/live-round-screen-actions';
import { optIntoLiveRound } from '@/lib/online/opt-into-live-round';
import { parseViewingBaseWordRoundParam } from '@/lib/online/parse-viewing-base-word-round-param';
import { mergeSessionWithWordMaps } from '@/lib/firebase/session-word-maps';
import { subscribeSessionWordMaps } from '@/lib/firebase/session-word-maps-service';
import type { SessionWordMaps } from '@/lib/firebase/types';
import type { RoundResultsViewData } from '@/lib/online/online-results-data';
import { useSyncedStackBack } from '@/hooks/useSyncedStackBack';
import { useFrozenRoundRecovery } from '@/hooks/useFrozenRoundRecovery';

import { stackHeaderBack } from '@/lib/navigation/stack-header-options';
import { useProfileStore } from '@/store/profile-store';

/**
 * Online round results — local archive first, Firebase only for rematch routing and cleanup.
 */
export default function OnlineResultsScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { gameId: rawGameId, baseWordRound: rawViewingRound } = useLocalSearchParams<{
    gameId: string;
    baseWordRound?: string;
  }>();
  const gameId = rawGameId ?? '';
  const viewingBaseWordRound = useMemo(
    () => parseViewingBaseWordRoundParam(rawViewingRound),
    [rawViewingRound],
  );
  const myUid = useOnlineViewerUid();

  const [liveSessionCore, setLiveSessionCore] = useState<GameSessionSnapshot | null>(null);
  const [liveWordMaps, setLiveWordMaps] = useState<SessionWordMaps | null>(null);
  const liveSession = useMemo(
    () => (liveSessionCore ? mergeSessionWithWordMaps(liveSessionCore, liveWordMaps) : null),
    [liveSessionCore, liveWordMaps],
  );
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
  const skipRematchToastRef = useRef(false);
  const skipResultsOfflineRef = useRef(false);
  const rematchToasts = useResultsRematchToast(liveSession, myUid, skipRematchToastRef);

  const rosterPlayerIds = useMemo(() => {
    if (frozenRound || !liveSession || liveSession.status !== 'finished') {
      return [];
    }
    return Object.keys(liveSession.players).sort();
  }, [frozenRound, liveSession]);

  const { liveWords, wordsBootstrapComplete } = useLiveRosterPlayerWords({
    gameId,
    rosterPlayerIds,
    enabled: Boolean(gameId && !frozenRound && rosterPlayerIds.length > 0),
  });

  const session = frozenRound?.session ?? liveSession;
  const wordsSnapshot = frozenRound?.words ?? liveWords;
  const { lexicon: roundLexicon, loading: lexiconLoading } = useResultsRoundLexicon(session, {
    gameId,
    baseWordRound: session?.baseWordRound,
  });

  const ensureArchived = useCallback(async (): Promise<void> => {
    if (archivedRef.current) {
      return;
    }
    if (!session || session.status !== 'finished' || !frozenRound || !myUid) {
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
        .then(() => {
          archivedRef.current = true;
        })
        .catch((error) => {
          archivePromiseRef.current = null;
          throw error;
        });
    }
    await archivePromiseRef.current;
  }, [frozenRound, gameId, myUid, session, wordsSnapshot]);

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
    const unsubMaps = subscribeSessionWordMaps(gameId, setLiveWordMaps);
    return () => {
      unsubSession();
      unsubMaps();
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
    if (
      freezeAttemptedRef.current ||
      frozenRound ||
      archiveRecoveryPending ||
      !liveSession ||
      liveSession.status !== 'finished'
    ) {
      return;
    }
    const liveRound = liveSession.baseWordRound ?? 0;
    if (!shouldFreezeLiveFinishedOnResults(liveRound, viewingBaseWordRound)) {
      return;
    }
    if (!wordsBootstrapComplete) {
      return;
    }
    if (!isSessionWordsSnapshotReady(liveSession, liveWords)) {
      return;
    }
    freezeAttemptedRef.current = true;
    setFrozenRound(freezeFinishedRound(gameId, liveSession, liveWords));
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
    return buildOnlineResultsView(t, session, wordsSnapshot, { viewerUid: myUid });
  }, [myUid, session, t, wordsSnapshot]);

  useEffect(() => {
    if (
      !viewData ||
      !session ||
      session.status !== 'finished' ||
      !myUid ||
      statsRecordedRef.current ||
      !frozenRound
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
  }, [ensureArchived, frozenRound, gameId, myUid, session, viewData]);

  useEffect(() => {
    if (!gameId || !myUid || skipResultsOfflineRef.current) {
      return;
    }
    const frozenRoundNum = frozenRound?.session.baseWordRound ?? viewingBaseWordRound ?? null;
    if (!resolveResultsPresence({ liveSession, frozenBaseWordRound: frozenRoundNum })) {
      return;
    }
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
    } catch {
      skipRematchToastRef.current = false;
      skipResultsOfflineRef.current = false;
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

  const screenOptions = useMemo(
    () => ({
      ...stackHeaderBack(onBack),
      headerTitle: () =>
        viewData ? (
          <StackHeaderTitle
            title={viewData.baseWordDisplay}
            subtitle={t('history.roomCode', { code: gameId })}
          />
        ) : (
          <StackHeaderTitle title={t('online.resultsTitle')} />
        ),
      headerTitleAlign: 'center' as const,
    }),
    [gameId, onBack, t, viewData],
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

  if (!viewData || (!wordsBootstrapComplete && !frozenRound)) {
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
        showBaseWordInMeta={false}
        showScores={viewData.uniqueBonusEnabled}
        showWordAuthors={!viewData.isSolo}
        roundDurationSeconds={viewData.roundDurationSeconds}
        footer={
          <>
            {rematchError ? <Text style={styles.error}>{rematchError}</Text> : null}
            <PrimaryButton
              label={t('game.newGameSamePlayers')}
              disabled={rematchLoading}
              onPress={() => {
                void handlePlayAgain();
              }}
            />
            <PrimaryButton
              label={t('nav.home')}
              variant="secondary"
              onPress={() => {
                void handleHome();
              }}
            />
          </>
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
