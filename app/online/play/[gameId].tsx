import { router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useConnectivity, useRegisterConnectivityMonitoring } from '@/contexts/ConnectivityContext';
import { useLiveRoundPlayScreen } from '@/hooks/useLiveRoundPlayScreen';
import { useRoundPlayableLexicon } from '@/hooks/useRoundPlayableLexicon';
import { GameMenuModal } from '@/components/GameMenuModal';
import { OnlinePlayActiveBody } from '@/components/online/OnlinePlayActiveBody';
import { OnlinePlayTimerHeader } from '@/components/online/OnlinePlayTimerHeader';
import { PlayDialogsStack } from '@/components/online/PlayDialogsStack';
import { PlayStandingsSheet } from '@/components/online/PlayStandingsSheet';
import { PlayStatsExplainModal } from '@/components/online/PlayStatsExplainModal';
import { PlayVoteLayer } from '@/components/online/PlayVoteLayer';
import { PauseRoundModal } from '@/components/PauseRoundModal';
import { RoomInviteModal } from '@/components/RoomInviteModal';
import { PrimaryButton } from '@/components/PrimaryButton';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { usePlaySessionSubscriptions } from '@/hooks/usePlaySessionSubscriptions';
import { usePlaySessionToasts } from '@/hooks/usePlaySessionToasts';
import { useResultsRematchToast } from '@/hooks/useResultsRematchToast';
import { useVoteExpiryResolver } from '@/hooks/useVoteExpiryResolver';
import { useTrainingMilestone } from '@/hooks/useTrainingMilestone';
import { useOnlineWordSubmit } from '@/hooks/useOnlineWordSubmit';
import { usePlayLeaveFlow } from '@/hooks/usePlayLeaveFlow';
import { usePlayVoteActions } from '@/hooks/usePlayVoteActions';
import { usePlayWordFeedbackDismiss } from '@/hooks/usePlayWordFeedback';
import { useRoundEndFlow } from '@/hooks/useRoundEndFlow';
import { useSessionScoresSync } from '@/hooks/useSessionScoresSync';
import { getCachedRoundPlayableLexicon } from '@/lib/dictionary/round-playable-lexicon-cache';
import { ensureAnonymousAuth } from '@/lib/firebase/auth';
import { getServerNow } from '@/lib/firebase/server-clock';
import { type GameSessionSnapshot } from '@/lib/firebase/game-session-service';
import { mergeSessionWithWordMaps } from '@/lib/firebase/session-word-maps';
import { resolveGameSessionSettingsForSession } from '@/lib/firebase/session-settings';
import type { SessionWordMaps } from '@/lib/firebase/types';
import { exitOnlineToHome } from '@/lib/online/exit-online-flow';
import {
  cacheActiveRoundProgress,
  purgeStaleActiveRoundCaches,
  tryRestoreActiveRoundCache,
} from '@/lib/online/cache-active-round';
import { isReviewingPriorRoundOnPlayScreen } from '@/lib/online/is-reviewing-prior-round-on-play';
import { hasOnlineOpponent } from '@/lib/online/session-presence';
import { consumePlaySessionBootstrap } from '@/lib/online/play-session-bootstrap';
import {
  reconcileOwnPlayerWordsWithSession,
  type StoredPlayerWord,
} from '@/lib/firebase/player-words-service';
import {
  proposeAddTime,
  proposeEarlyFinish,
  proposePause,
  proposeResume,
  voteEarlyFinish,
  voteResume,
} from '@/lib/firebase/session-votes-service';
import { buildOnlineWordListDisplay } from '@/lib/online/online-word-display';
import { buildLiveStandingsFromSession } from '@/lib/online/live-standings';
import { formatPlayRulesLabel } from '@/lib/online/play-rules-label';
import { flushSubmitLatencySummary } from '@/lib/online/submit-word-profile';
import { buildLetterKeys } from '@/lib/game/letter-keyboard';
import { type PlayWordFeedbackVariant } from '@/lib/game/play-word-feedback';
import { displayRankForPlayer, shouldShowPointUi, type PlayerStandings } from '@/lib/game/scoring';
import { useFirebaseStore } from '@/store/firebase-store';
import { useProfileStore } from '@/store/profile-store';
import { useSettingsStore } from '@/store/settings-store';

const EMPTY_WORD_LIST_ENTRIES: never[] = [];
const EMPTY_WORD_LIST_DISPLAYS: string[] = [];

/**
 * Online multiplayer play — per-device keyboard, Firebase sync (M2.3).
 */
export default function OnlinePlayScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { gameId: rawGameId, openInvite: rawOpenInvite } = useLocalSearchParams<{
    gameId: string;
    openInvite?: string;
  }>();
  const gameId = rawGameId ?? '';
  const storeUid = useFirebaseStore((state) => state.uid);
  const [resolvedUid, setResolvedUid] = useState(storeUid ?? '');
  const myUid = resolvedUid || storeUid || '';
  const isPlayScreenFocused = useIsFocused();
  const wordAcceptedFeedback = useSettingsStore((state) => state.wordAcceptedFeedback);
  const timerAlertMode = useSettingsStore((state) => state.timerAlertMode);
  const viewerGender = useProfileStore((state) => state.gender);
  const { hydrated: trainingHydrated, hasCompletedTrainingRound } = useTrainingMilestone();
  const canInviteOthers = trainingHydrated && hasCompletedTrainingRound;
  const { rtdbConnected } = useConnectivity();

  const [playInit] = useState(() => {
    const bootstrap = gameId ? consumePlaySessionBootstrap(gameId) : null;
    return { session: bootstrap, loading: bootstrap === null };
  });
  const [sessionCore, setSessionCore] = useState<GameSessionSnapshot | null>(playInit.session);
  const [wordMaps, setWordMaps] = useState<SessionWordMaps | null>(null);
  const session = useMemo(
    () => (sessionCore ? mergeSessionWithWordMaps(sessionCore, wordMaps) : null),
    [sessionCore, wordMaps],
  );
  const hasOnlineOpponentInRound = useMemo(
    () => (session && myUid ? hasOnlineOpponent(session, myUid) : false),
    [myUid, session],
  );
  useRegisterConnectivityMonitoring(hasOnlineOpponentInRound);
  const [myWords, setMyWords] = useState<Map<string, StoredPlayerWord>>(new Map());
  const [loading, setLoading] = useState(playInit.loading);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [draftKeyIndices, setDraftKeyIndices] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackVariant, setFeedbackVariant] = useState<PlayWordFeedbackVariant>('default');
  const [showStandings, setShowStandings] = useState(false);
  const [showStatsExplain, setShowStatsExplain] = useState(false);
  const [showGameMenu, setShowGameMenu] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showEndEarlyConfirm, setShowEndEarlyConfirm] = useState(false);
  const [showAddTimeModal, setShowAddTimeModal] = useState(false);
  const [backgroundSyncing, setBackgroundSyncing] = useState(false);
  const [optimisticWords, setOptimisticWords] = useState<Map<string, StoredPlayerWord>>(new Map());
  const [scrollRequest, setScrollRequest] = useState<{ normalized: string; id: number } | null>(
    null,
  );
  const [roundOverPendingResults, setRoundOverPendingResults] = useState(false);
  const [roundEndWordsSnapshot, setRoundEndWordsSnapshot] = useState<Map<
    string,
    StoredPlayerWord
  > | null>(null);
  const [roundEndSessionSnapshot, setRoundEndSessionSnapshot] =
    useState<GameSessionSnapshot | null>(null);
  const roundEnded = session?.status === 'finished' || roundOverPendingResults;
  const timeUpModalVisible = roundEnded;
  const skipRematchToastRef = useRef(false);
  const rematchToasts = useResultsRematchToast(sessionCore, myUid, skipRematchToastRef);
  const playToasts = usePlaySessionToasts(session, myUid, !roundEnded);
  const sessionToasts = useMemo(
    () => [...playToasts, ...rematchToasts],
    [playToasts, rematchToasts],
  );

  const finishAttemptedRef = useRef(false);
  const resultsNavigatedRef = useRef(false);
  const leftNavigatedRef = useRef(false);
  const leavingIntentionallyRef = useRef(false);
  const playRoundKeyRef = useRef<number | null>(null);
  const staleWordsReconcileKeyRef = useRef<string | null>(null);
  const wordMapsRef = useRef(wordMaps);
  wordMapsRef.current = wordMaps;
  const myWordsRef = useRef(myWords);
  myWordsRef.current = myWords;
  const draftKeyIndicesRef = useRef(draftKeyIndices);
  draftKeyIndicesRef.current = draftKeyIndices;

  useEffect(() => {
    if (rawOpenInvite === '1' && canInviteOthers) {
      setShowInviteModal(true);
    }
  }, [canInviteOthers, rawOpenInvite]);

  useEffect(() => {
    void purgeStaleActiveRoundCaches();
  }, []);

  useEffect(() => {
    void ensureAnonymousAuth().then((user) => {
      setResolvedUid(user.uid);
    });
  }, []);

  usePlaySessionSubscriptions({
    gameId,
    myUid,
    t,
    setSessionCore,
    setLoading,
    setLoadError,
    setWordMaps,
    setMyWords,
  });

  useLiveRoundPlayScreen({
    gameId,
    myUid,
    session,
    loading,
    roundEnded,
    frozenBaseWordRound: roundEndSessionSnapshot?.baseWordRound ?? playRoundKeyRef.current,
    isFocused: isPlayScreenFocused,
    leavingIntentionallyRef,
    onJoinFailed: setLoadError,
  });

  useEffect(() => {
    if (resultsNavigatedRef.current || !session || session.status !== 'playing' || !myUid) {
      return undefined;
    }
    let cancelled = false;
    const roundKey = `${session.baseWordRound ?? 0}:${session.timerEndsAt ?? 0}`;
    void (async () => {
      if (
        myWords.size > 0 &&
        (session.players[myUid]?.wordCount ?? 0) === 0 &&
        staleWordsReconcileKeyRef.current !== roundKey
      ) {
        staleWordsReconcileKeyRef.current = roundKey;
        await reconcileOwnPlayerWordsWithSession(gameId, myUid, session, myWords);
        if (cancelled) {
          return;
        }
      }
      await tryRestoreActiveRoundCache(gameId, myUid, session, myWords.size);
      if (cancelled) {
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depend on word count, not Map identity
  }, [gameId, myUid, myWords.size, session]);

  useEffect(() => {
    if (!session || session.status !== 'playing' || !myUid) {
      return undefined;
    }
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') {
        flushSubmitLatencySummary();
        void cacheActiveRoundProgress(gameId, myUid, session, myWordsRef.current);
      }
    });
    return () => {
      sub.remove();
    };
  }, [gameId, myUid, session]);

  const displaySession = useMemo(() => {
    if (roundEnded && roundEndSessionSnapshot) {
      return roundEndSessionSnapshot;
    }
    return session;
  }, [roundEnded, roundEndSessionSnapshot, session]);

  const endsAt = displaySession?.timerEndsAt ?? null;
  const resolvedSessionSettings = displaySession
    ? resolveGameSessionSettingsForSession(displaySession)
    : null;
  const uniqueBonusEnabled = resolvedSessionSettings?.uniqueBonusEnabled ?? false;
  const allowProperNouns = resolvedSessionSettings?.allowProperNouns ?? false;
  const allowSlang = resolvedSessionSettings?.allowSlang ?? false;
  const { lexicon: roundLexicon } = useRoundPlayableLexicon({
    baseWord: displaySession?.baseWord ?? '',
    allowProperNouns,
    allowSlang,
    releaseDictionaryAfterBuild: true,
    enabled: Boolean(displaySession?.baseWord && displaySession.status === 'playing'),
  });
  const showPointUi = shouldShowPointUi(uniqueBonusEnabled);

  const isPaused = displaySession?.pauseState?.active === true;
  const reviewingPriorRound = isReviewingPriorRoundOnPlayScreen(
    roundEnded,
    roundEndSessionSnapshot?.baseWordRound ?? null,
    session?.baseWordRound ?? null,
  );
  const showLivePauseModal = isPaused && !reviewingPriorRound;

  useVoteExpiryResolver({
    gameId,
    enabled: !resultsNavigatedRef.current,
    earlyFinishVote: session?.earlyFinishVote,
    addTimeVote: session?.addTimeVote,
    resumeVote: session?.resumeVote,
    pauseActive: isPaused,
    playing: session?.status === 'playing',
  });

  useEffect(() => {
    if (
      session?.pauseVote ||
      session?.earlyFinishVote ||
      session?.addTimeVote ||
      session?.resumeVote
    ) {
      setShowGameMenu(false);
    }
  }, [session?.pauseVote, session?.earlyFinishVote, session?.addTimeVote, session?.resumeVote]);

  useEffect(() => {
    if (session?.addTimeVote) {
      finishAttemptedRef.current = false;
    }
  }, [session?.addTimeVote]);

  const deferredWordMaps = useDeferredValue(wordMaps);
  const sessionForWordList = useMemo(() => {
    if (roundEnded && roundEndSessionSnapshot) {
      return roundEndSessionSnapshot;
    }
    return sessionCore ? mergeSessionWithWordMaps(sessionCore, deferredWordMaps) : null;
  }, [deferredWordMaps, roundEnded, roundEndSessionSnapshot, sessionCore]);

  const baseWord = displaySession?.baseWord ?? '';
  const letterKeys = useMemo(() => buildLetterKeys(baseWord), [baseWord]);
  const cachedLexiconMaxCount = useMemo(() => {
    if (!baseWord) {
      return null;
    }
    return getCachedRoundPlayableLexicon(baseWord, allowProperNouns, allowSlang)?.maxCount ?? null;
  }, [allowProperNouns, allowSlang, baseWord]);
  const maxWordCount = roundLexicon?.maxCount ?? cachedLexiconMaxCount;

  const wordsForDisplay = useMemo(() => {
    const baseWords = roundEndWordsSnapshot ?? myWords;
    if (optimisticWords.size === 0) {
      return baseWords;
    }
    const merged = new Map(baseWords);
    for (const [normalized, word] of optimisticWords) {
      if (!merged.has(normalized)) {
        merged.set(normalized, word);
      }
    }
    return merged;
  }, [myWords, optimisticWords, roundEndWordsSnapshot]);

  const { entries: scoredWords, displays } = useMemo(() => {
    if (!sessionForWordList) {
      return { entries: EMPTY_WORD_LIST_ENTRIES, displays: EMPTY_WORD_LIST_DISPLAYS };
    }
    const result = buildOnlineWordListDisplay(wordsForDisplay, sessionForWordList, myUid);
    if (result.entries.length === 0) {
      return { entries: EMPTY_WORD_LIST_ENTRIES, displays: EMPTY_WORD_LIST_DISPLAYS };
    }
    return result;
  }, [myUid, sessionForWordList, wordsForDisplay]);

  const myPlayer = displaySession?.players[myUid];
  const standings = useMemo((): PlayerStandings[] => {
    if (!displaySession) {
      return [];
    }
    return buildLiveStandingsFromSession(displaySession);
  }, [displaySession]);

  const playerScore = standings.find((row) => row.playerId === myUid)?.score ?? 0;
  // Local word list is authoritative for the viewer — avoids flicker when session totals lag maps.
  const playerWordCount =
    wordsForDisplay.size > 0 ? wordsForDisplay.size : (myPlayer?.wordCount ?? 0);
  const myName = myPlayer?.name ?? t('profile.namePlaceholder');

  const remainingMsRef = useRef(0);
  const roundEndedRef = useRef(roundEnded);
  const isPausedRef = useRef(isPaused);
  remainingMsRef.current = isPaused
    ? (session?.pauseState?.frozenRemainingMs ?? 0)
    : endsAt
      ? Math.max(0, endsAt - getServerNow())
      : 0;
  roundEndedRef.current = roundEnded;
  isPausedRef.current = isPaused;

  const openGameMenu = useCallback(() => {
    setShowGameMenu(true);
  }, []);
  const openAddTimeModal = useCallback(() => {
    setShowAddTimeModal(true);
  }, []);
  const openStandings = useCallback(() => {
    setShowStandings(true);
  }, []);
  const openStatsExplain = useCallback(() => {
    setShowStatsExplain(true);
  }, []);
  const closeGameMenu = useCallback(() => {
    setShowGameMenu(false);
  }, []);
  const closeExitConfirm = useCallback(() => {
    setShowExitConfirm(false);
  }, []);

  useSessionScoresSync({ gameId, myUid, session, wordMaps, wordMapsRef });

  const playerRank = displayRankForPlayer(standings, myUid);
  const hasOpponent = standings.length >= 2;
  const playRulesLabel = formatPlayRulesLabel(t, displaySession?.settings);

  const clearFeedback = useCallback(() => {
    setFeedback(null);
    setFeedbackVariant('default');
  }, []);
  usePlayWordFeedbackDismiss(feedback, feedbackVariant, clearFeedback);

  const { debounceRef, pressKey, clearDraft, backspaceDraft, onMyWordsUpdated } =
    useOnlineWordSubmit({
      gameId,
      myUid,
      session,
      roundLexicon,
      uniqueBonusEnabled,
      wordsForDisplay,
      myWordsRef,
      resultsNavigatedRef,
      roundEndedRef,
      isPausedRef,
      remainingMsRef,
      draftKeyIndicesRef,
      letterKeys,
      wordAcceptedFeedback,
      t,
      rtdbOnline: rtdbConnected,
      draft,
      setDraft,
      setDraftKeyIndices,
      setFeedback,
      setFeedbackVariant,
      setOptimisticWords,
      setScrollRequest,
      setBackgroundSyncing,
    });

  useEffect(() => {
    onMyWordsUpdated(myWords);
  }, [myWords, onMyWordsUpdated]);

  const { runIntentionalLeave, leaveToHome } = usePlayLeaveFlow({
    gameId,
    myUid,
    session,
    myWords,
    myWordsRef,
    leavingIntentionallyRef,
    leftNavigatedRef,
    onCloseExitConfirm: closeExitConfirm,
    onCloseGameMenu: closeGameMenu,
  });

  const {
    cancelEarlyFinishProposal,
    cancelPauseProposal,
    cancelAddTimeProposal,
    cancelResumeProposal,
    leaveNowFromEarlyFinish,
    onVoteEarlyFinish,
    onVotePause,
    onVoteAddTime,
    handleEndEarlyConfirm,
  } = usePlayVoteActions({
    gameId,
    myUid,
    session,
    isPaused,
    debounceRef,
    runIntentionalLeave,
    setFeedback,
    setShowEndEarlyConfirm,
    setShowAddTimeModal,
    setShowStandings,
    t,
  });

  const { navigateToResults } = useRoundEndFlow({
    gameId,
    session,
    myWords,
    roundEnded,
    roundOverPendingResults,
    setRoundOverPendingResults,
    roundEndWordsSnapshot,
    setRoundEndWordsSnapshot,
    roundEndSessionSnapshot,
    setRoundEndSessionSnapshot,
    playRoundKeyRef,
    resultsNavigatedRef,
    finishAttemptedRef,
    leavingIntentionallyRef,
    leftNavigatedRef,
    staleWordsReconcileKeyRef,
    wordMapsRef,
    debounceRef,
    endsAt,
    isPaused,
    hasAddTimeVote: Boolean(session?.addTimeVote),
  });

  useEffect(() => {
    if (!roundEnded) {
      return;
    }
    setShowStandings(false);
    setShowStatsExplain(false);
    setShowGameMenu(false);
    setShowInviteModal(false);
    setShowExitConfirm(false);
    setShowEndEarlyConfirm(false);
    setShowAddTimeModal(false);
  }, [roundEnded]);

  if (loadError || (!loading && (!session || !myUid))) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadError}>{loadError ?? t('online.errorJoinFailed')}</Text>
        <PrimaryButton
          label={t('nav.home')}
          onPress={() => {
            void exitOnlineToHome({
              gameId,
              uid: myUid,
              isOrganizer: false,
              sessionStatus: session?.status ?? null,
              session,
            });
          }}
        />
      </View>
    );
  }

  if (loading || !session || !myUid) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const roundUiReady = session.status === 'playing' || roundEnded || session.timerEndsAt != null;
  if (!roundUiReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const earlyVote = session.earlyFinishVote;
  const pauseVote = session.pauseVote;
  const addTimeVote = session.addTimeVote;
  const resumeVote = session.resumeVote;
  const gameMenuBlockedByVote = Boolean(
    pauseVote || earlyVote || addTimeVote || (isPaused && resumeVote),
  );
  const pauseUiObscured =
    showGameMenu ||
    showInviteModal ||
    showExitConfirm ||
    (showEndEarlyConfirm && !hasOnlineOpponentInRound);
  const canProposeAddTime = !isPaused && !earlyVote && !pauseVote && !addTimeVote;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {!isPaused ? (
        <>
          <OnlinePlayTimerHeader
            timerEndsAt={endsAt}
            pauseFrozenRemainingMs={session?.pauseState?.frozenRemainingMs ?? null}
            isPaused={false}
            roundActive={session.status === 'playing'}
            rank={playerRank}
            wordCount={playerWordCount}
            maxWordCount={maxWordCount}
            score={playerScore}
            showRank={hasOpponent}
            showScore={showPointUi && hasOpponent}
            roundEnded={roundEnded}
            canProposeAddTime={canProposeAddTime}
            hasOpponent={hasOpponent}
            timerAlertMode={timerAlertMode}
            onOpenGameMenu={openGameMenu}
            onOpenAddTimeModal={openAddTimeModal}
            onOpenStandings={openStandings}
            onOpenStatsExplain={openStatsExplain}
          />

          <OnlinePlayActiveBody
            myName={myName}
            playRulesLabel={playRulesLabel}
            entries={scoredWords}
            displays={displays}
            draft={draft}
            draftKeyIndices={draftKeyIndices}
            letterKeys={letterKeys}
            scrollToNormalized={scrollRequest?.normalized ?? null}
            scrollToRequestId={scrollRequest?.id}
            feedback={feedback}
            feedbackVariant={feedbackVariant}
            backgroundSyncing={backgroundSyncing}
            showScoreBadges={showPointUi && hasOpponent}
            showOverlapPeers={hasOpponent}
            onPressKey={pressKey}
            onClearDraft={clearDraft}
            onBackspaceDraft={backspaceDraft}
          />
        </>
      ) : null}

      <PlayStandingsSheet
        visible={showStandings && !gameMenuBlockedByVote && !roundEnded}
        session={session}
        myUid={myUid}
        standings={standings}
        showPointUi={showPointUi}
        onClose={() => {
          setShowStandings(false);
        }}
      />

      <PlayStatsExplainModal
        visible={showStatsExplain && !hasOpponent && !roundEnded}
        wordCount={playerWordCount}
        maxWordCount={maxWordCount}
        showTrainingUnlockHint={false}
        onClose={() => {
          setShowStatsExplain(false);
        }}
      />

      {showGameMenu && !gameMenuBlockedByVote && !roundEnded ? (
        <GameMenuModal
          visible
          endGameLabel={
            hasOnlineOpponentInRound ? t('game.menuProposeEnd') : t('game.menuEndEarly')
          }
          showEndGame={hasOnlineOpponentInRound}
          onClose={() => {
            setShowGameMenu(false);
          }}
          onPause={() => {
            setShowGameMenu(false);
            void proposePause(gameId, myUid);
          }}
          onProposeEnd={() => {
            setShowGameMenu(false);
            if (hasOnlineOpponentInRound) {
              void proposeEarlyFinish(gameId, myUid);
            } else {
              setShowEndEarlyConfirm(true);
            }
          }}
          showPause={!isPaused && !earlyVote && !pauseVote && !addTimeVote}
          pauseLabel={hasOnlineOpponentInRound ? t('game.menuPause') : t('game.menuPauseSolo')}
          showInvite={canInviteOthers}
          onInvite={() => {
            setShowGameMenu(false);
            setShowInviteModal(true);
          }}
          onExit={() => {
            setShowGameMenu(false);
            if (hasOnlineOpponentInRound) {
              setShowExitConfirm(true);
            } else {
              setShowEndEarlyConfirm(true);
            }
          }}
          onOpenSettings={() => {
            setShowGameMenu(false);
            router.push('/settings');
          }}
          onOpenHowToPlay={() => {
            setShowGameMenu(false);
            setShowHowToPlay(true);
          }}
        />
      ) : null}

      <RoomInviteModal
        visible={showInviteModal && !roundEnded}
        roomCode={gameId}
        invitedByUid={myUid}
        roundInProgress={session.status === 'playing'}
        topContent={
          showInviteModal ? (
            <PlayVoteLayer
              layout="banner"
              isPaused={isPaused}
              session={session}
              myUid={myUid}
              earlyVote={earlyVote}
              pauseVote={pauseVote}
              addTimeVote={addTimeVote}
              onVoteEarlyFinish={onVoteEarlyFinish}
              onCancelEarlyFinishProposal={cancelEarlyFinishProposal}
              onLeaveNowFromEarlyFinish={leaveNowFromEarlyFinish}
              onVotePause={onVotePause}
              onCancelPauseProposal={cancelPauseProposal}
              onVoteAddTime={onVoteAddTime}
              onCancelAddTimeProposal={cancelAddTimeProposal}
            />
          ) : undefined
        }
        onClose={() => {
          setShowInviteModal(false);
        }}
      />

      {showLivePauseModal ? (
        <PauseRoundModal
          visible={isPlayScreenFocused && !pauseUiObscured}
          session={session}
          myUid={myUid}
          viewerGender={viewerGender}
          resumeVote={resumeVote}
          earlyFinishVote={earlyVote}
          hasOnlineOpponent={hasOnlineOpponentInRound}
          onProposeResume={() => {
            void proposeResume(gameId, myUid);
          }}
          onResumeYes={() => {
            void voteResume(gameId, myUid, 'yes');
          }}
          onResumeNo={() => {
            void voteResume(gameId, myUid, 'no');
          }}
          onCancelResumeProposal={
            resumeVote?.proposedBy === myUid ? cancelResumeProposal : undefined
          }
          onEarlyFinishYes={() => {
            void voteEarlyFinish(gameId, myUid, 'yes');
          }}
          onEarlyFinishNo={() => {
            void voteEarlyFinish(gameId, myUid, 'no');
          }}
          onCancelEarlyFinishProposal={
            earlyVote?.proposedBy === myUid ? cancelEarlyFinishProposal : undefined
          }
          onLeaveNowFromEarlyFinish={
            earlyVote?.proposedBy === myUid ? leaveNowFromEarlyFinish : undefined
          }
          onOpenMenu={() => {
            setShowGameMenu(true);
          }}
          onOpenSettings={() => {
            router.push('/settings');
          }}
        />
      ) : null}

      {!showInviteModal ? (
        <PlayVoteLayer
          layout="modal"
          isPaused={isPaused}
          session={session}
          myUid={myUid}
          earlyVote={earlyVote}
          pauseVote={pauseVote}
          addTimeVote={addTimeVote}
          onVoteEarlyFinish={onVoteEarlyFinish}
          onCancelEarlyFinishProposal={cancelEarlyFinishProposal}
          onLeaveNowFromEarlyFinish={leaveNowFromEarlyFinish}
          onVotePause={onVotePause}
          onCancelPauseProposal={cancelPauseProposal}
          onVoteAddTime={onVoteAddTime}
          onCancelAddTimeProposal={cancelAddTimeProposal}
        />
      ) : null}

      <PlayDialogsStack
        t={t}
        roundEnded={roundEnded}
        isPaused={isPaused}
        sessionPlaying={session.status === 'playing'}
        canProposeAddTime={canProposeAddTime}
        showAddTimeModal={showAddTimeModal}
        addTimeRemainingMs={
          showAddTimeModal && endsAt != null ? Math.max(0, endsAt - getServerNow()) : 0
        }
        hasOpponent={hasOpponent}
        onCloseAddTime={() => {
          setShowAddTimeModal(false);
        }}
        onSelectAddTime={(minutes) => {
          void proposeAddTime(gameId, myUid, minutes);
        }}
        showEndEarlyConfirm={showEndEarlyConfirm}
        hasOnlineOpponentInRound={hasOnlineOpponentInRound}
        onEndEarlyConfirm={() => {
          handleEndEarlyConfirm(wordMaps);
        }}
        onDismissEndEarlyConfirm={() => {
          setShowEndEarlyConfirm(false);
        }}
        showExitConfirm={showExitConfirm}
        onLeaveToHome={leaveToHome}
        onDismissExitConfirm={() => {
          setShowExitConfirm(false);
        }}
        sessionToasts={sessionToasts}
        timeUpModalVisible={timeUpModalVisible}
        onViewResults={() => {
          void navigateToResults();
        }}
        showHowToPlay={showHowToPlay}
        onDismissHowToPlay={() => setShowHowToPlay(false)}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.backgroundSecondary,
      paddingHorizontal: spacing.md,
      gap: spacing.md,
    },
    loadError: {
      fontSize: 16,
      color: colors.danger,
      textAlign: 'center',
    },
    container: {
      flex: 1,
      position: 'relative',
      backgroundColor: colors.backgroundSecondary,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      paddingTop: spacing.xs,
      gap: spacing.sm,
    },
  });
}
