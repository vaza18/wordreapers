import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { PlaySessionToastStack } from '@/components/PlaySessionToast';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RoundResultsView } from '@/components/RoundResultsView';
import { useResultsRematchToast } from '@/hooks/useResultsRematchToast';
import { useResultsRoundLexicon } from '@/hooks/useResultsRoundLexicon';
import type { PlayableLexiconSnapshot } from '@/lib/dictionary/round-playable-lexicon';
import { StackHeaderTitle } from '@/components/StackHeaderTitle';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { ensureAnonymousAuth } from '@/lib/firebase/auth';
import { markResultsExited } from '@/lib/firebase/results-coordination-service';
import {
  markPlayerOffline,
  rejoinExistingPlayer,
  removeOrphanGameSessionShell,
  subscribeGameSession,
  type GameSessionSnapshot,
} from '@/lib/firebase/game-session-service';
import {
  fetchSessionPlayerWords,
  subscribeSessionPlayerWords,
} from '@/lib/firebase/player-words-service';
import { exitOnlineToHome } from '@/lib/online/exit-online-flow';
import { persistLocalArchive } from '@/lib/online/coordinated-session-cleanup';
import { restartRematchOnlineRound } from '@/lib/online/restart-rematch-online-round';
import { mergeAllPlayerWords, type AllPlayerWords } from '@/lib/online/clone-player-words';
import { isSessionWordsSnapshotReady } from '@/lib/online/session-words-bootstrap';
import {
  freezeFinishedRound,
  loadFrozenFinishedRoundBeforeLive,
  loadFrozenFinishedRoundFromArchive,
  loadLatestFrozenFinishedRoundFromArchive,
  type FrozenFinishedRound,
} from '@/lib/online/frozen-finished-round';
import { finalizeOnlineRoundForPlayer } from '@/lib/online/finalize-online-round';
import {
  getFinishedRoundArchive,
  isFinishedArchiveStale,
} from '@/lib/online/online-session-archive';
import { buildOnlineResultsView } from '@/lib/online/online-results-data';
import { shouldRecoverFinishedRoundFromArchive } from '@/lib/online/should-recover-finished-round-from-archive';
import { resolveRematchNavigationRoute } from '@/lib/online/resolve-rematch-navigation-route';
import { parseViewingBaseWordRoundParam } from '@/lib/online/parse-viewing-base-word-round-param';
import { shouldFreezeLiveFinishedOnResults } from '@/lib/online/should-freeze-live-finished-on-results';
import { shouldLoadViewingRoundFromArchive } from '@/lib/online/should-load-viewing-round-from-archive';
import { mergeSessionWithWordMaps } from '@/lib/firebase/session-word-maps';
import { subscribeSessionWordMaps } from '@/lib/firebase/session-word-maps-service';
import type { SessionWordMaps } from '@/lib/firebase/types';
import type { RoundResultsViewData } from '@/lib/online/online-results-data';
import { useSyncedStackBack } from '@/hooks/useSyncedStackBack';
import { stackHeaderBack } from '@/lib/navigation/stack-header-options';
import { useFirebaseStore } from '@/store/firebase-store';
import { useProfileStore } from '@/store/profile-store';

const EMPTY_WORDS: AllPlayerWords = new Map();

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
  const storeUid = useFirebaseStore((state) => state.uid);
  const [resolvedUid, setResolvedUid] = useState(storeUid ?? '');
  const myUid = resolvedUid || storeUid || '';

  const [liveSessionCore, setLiveSessionCore] = useState<GameSessionSnapshot | null>(null);
  const [liveWordMaps, setLiveWordMaps] = useState<SessionWordMaps | null>(null);
  const liveSession = useMemo(
    () => (liveSessionCore ? mergeSessionWithWordMaps(liveSessionCore, liveWordMaps) : null),
    [liveSessionCore, liveWordMaps],
  );
  const [liveWords, setLiveWords] = useState(EMPTY_WORDS);
  const [frozenRound, setFrozenRound] = useState<FrozenFinishedRound | null>(null);
  const [localLoadComplete, setLocalLoadComplete] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [wordsBootstrapComplete, setWordsBootstrapComplete] = useState(false);
  const [rematchLoading, setRematchLoading] = useState(false);
  const [rematchError, setRematchError] = useState<string | null>(null);
  const [archiveRecoveryPending, setArchiveRecoveryPending] = useState(false);
  const [archiveLexicon, setArchiveLexicon] = useState<PlayableLexiconSnapshot | null>(null);
  const statsRecordedRef = useRef(false);
  const archivedRef = useRef(false);
  const archivePromiseRef = useRef<Promise<void> | null>(null);
  const freezeAttemptedRef = useRef(false);
  const skipRematchToastRef = useRef(false);
  const rematchToasts = useResultsRematchToast(liveSession, myUid, skipRematchToastRef);

  const session = frozenRound?.session ?? liveSession;
  const wordsSnapshot = frozenRound?.words ?? liveWords;
  const { lexicon: roundLexicon, loading: lexiconLoading } = useResultsRoundLexicon(
    session,
    archiveLexicon,
  );

  useEffect(() => {
    if (!gameId || session?.baseWordRound == null) {
      return;
    }
    void getFinishedRoundArchive(gameId, session.baseWordRound).then((archive) => {
      setArchiveLexicon(archive?.playableLexicon ?? null);
    });
  }, [gameId, session?.baseWordRound]);

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

  const rosterPlayerIds = useMemo(() => {
    if (frozenRound || !liveSession || liveSession.status !== 'finished') {
      return [];
    }
    return Object.keys(liveSession.players).sort();
  }, [frozenRound, liveSession]);

  const mergeWords = useCallback((incoming: AllPlayerWords) => {
    setLiveWords((prev) => mergeAllPlayerWords(prev, incoming));
  }, []);

  useEffect(() => {
    void ensureAnonymousAuth().then((user) => {
      setResolvedUid(user.uid);
    });
  }, []);

  useEffect(() => {
    setLocalLoadComplete(true);
  }, [gameId]);

  useEffect(() => {
    if (!sessionLoaded || !gameId || frozenRound) {
      return undefined;
    }
    if (!shouldLoadViewingRoundFromArchive(viewingBaseWordRound, liveSession)) {
      return undefined;
    }
    let cancelled = false;
    setArchiveRecoveryPending(true);
    void (async () => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const archived = await loadFrozenFinishedRoundFromArchive(gameId, viewingBaseWordRound);
        if (cancelled) {
          return;
        }
        if (archived) {
          freezeAttemptedRef.current = true;
          setFrozenRound(archived);
          setWordsBootstrapComplete(true);
          const entry = await getFinishedRoundArchive(gameId, viewingBaseWordRound);
          if (entry?.ackSent === true) {
            archivedRef.current = true;
          }
          setArchiveRecoveryPending(false);
          return;
        }
        if (attempt < 7) {
          await new Promise((resolve) => {
            setTimeout(resolve, 200);
          });
        }
      }
      if (!cancelled) {
        setArchiveRecoveryPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [frozenRound, gameId, liveSession, sessionLoaded, viewingBaseWordRound]);

  useEffect(() => {
    if (!sessionLoaded || !gameId || frozenRound) {
      return undefined;
    }
    if (!shouldRecoverFinishedRoundFromArchive(liveSession)) {
      return undefined;
    }
    if (viewingBaseWordRound != null) {
      return undefined;
    }
    let cancelled = false;
    setArchiveRecoveryPending(true);
    void (async () => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const archived = liveSession
          ? await loadFrozenFinishedRoundBeforeLive(gameId, liveSession.baseWordRound ?? 0)
          : await loadLatestFrozenFinishedRoundFromArchive(gameId);
        if (cancelled) {
          return;
        }
        if (archived) {
          freezeAttemptedRef.current = true;
          setFrozenRound(archived);
          setWordsBootstrapComplete(true);
          const round = archived.session.baseWordRound ?? 0;
          const entry = await getFinishedRoundArchive(gameId, round);
          if (entry?.ackSent === true) {
            archivedRef.current = true;
          }
          setArchiveRecoveryPending(false);
          return;
        }
        if (attempt < 7) {
          await new Promise((resolve) => {
            setTimeout(resolve, 200);
          });
        }
      }
      if (!cancelled) {
        setArchiveRecoveryPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [frozenRound, gameId, liveSession, sessionLoaded, viewingBaseWordRound]);

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
    const uid = resolvedUid || useFirebaseStore.getState().uid;
    if (uid) {
      void markPlayerOffline(gameId, uid).then(() => removeOrphanGameSessionShell(gameId, uid));
    }
  }, [archiveRecoveryPending, frozenRound, gameId, liveSession, resolvedUid, sessionLoaded]);

  useEffect(() => {
    if (!gameId || frozenRound || rosterPlayerIds.length === 0) {
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
  }, [frozenRound, gameId, mergeWords, rosterPlayerIds]);

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
    if (!gameId || !myUid) {
      return;
    }
    if (liveSession?.status !== 'finished' && !frozenRound) {
      return;
    }
    void markPlayerOffline(gameId, myUid);
  }, [frozenRound, gameId, liveSession?.status, myUid]);

  const isOrganizer = session?.organizerId === myUid;

  const handlePlayAgain = useCallback(async () => {
    setRematchError(null);
    setRematchLoading(true);
    skipRematchToastRef.current = true;
    try {
      await markResultsExited(gameId, myUid);
      const sessionStatus = liveSession?.status ?? session?.status;
      if (sessionStatus === 'finished') {
        const baseWordRound = session?.baseWordRound ?? frozenRound?.session.baseWordRound ?? 0;
        await restartRematchOnlineRound(gameId, myUid, baseWordRound);
      } else if (sessionStatus === 'playing') {
        const { name, gender, avatarColorIndex } = useProfileStore.getState();
        await rejoinExistingPlayer(gameId, myUid, { name, gender, avatarColorIndex });
      }
    } catch {
      skipRematchToastRef.current = false;
      setRematchError(t('online.errorRematchFailed'));
      setRematchLoading(false);
      return;
    }
    setRematchLoading(false);
    const sessionStatus = liveSession?.status ?? session?.status;
    router.replace(resolveRematchNavigationRoute(sessionStatus, gameId));
  }, [
    frozenRound?.session.baseWordRound,
    gameId,
    liveSession?.status,
    myUid,
    session?.baseWordRound,
    session?.status,
    t,
  ]);

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
