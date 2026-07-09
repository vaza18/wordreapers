import { router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLiveRoundPlayScreen } from '@/hooks/useLiveRoundPlayScreen';
import { useRoundPlayableLexicon } from '@/hooks/useRoundPlayableLexicon';
import { BottomSheetModal } from '@/components/BottomSheetModal';
import { GameMenuModal } from '@/components/GameMenuModal';
import { OnlinePlayActiveBody } from '@/components/online/OnlinePlayActiveBody';
import { OnlinePlayTimerHeader } from '@/components/online/OnlinePlayTimerHeader';
import { PlayStatsExplainModal } from '@/components/online/PlayStatsExplainModal';
import { PlayDialogsStack } from '@/components/online/PlayDialogsStack';
import { PlayVoteLayer } from '@/components/online/PlayVoteLayer';
import { PauseRoundModal } from '@/components/PauseRoundModal';
import { RoomInviteModal } from '@/components/RoomInviteModal';
import { PrimaryButton } from '@/components/PrimaryButton';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useAutoPauseOnAppBackground } from '@/hooks/useAutoPauseOnAppBackground';
import {
  PLAY_WORD_FEEDBACK_DISMISS_MS,
  usePlayWordFeedbackDismiss,
} from '@/hooks/usePlayWordFeedback';
import { usePlaySessionSubscriptions } from '@/hooks/usePlaySessionSubscriptions';
import { usePlaySessionToasts } from '@/hooks/usePlaySessionToasts';
import { useResultsRematchToast } from '@/hooks/useResultsRematchToast';
import { useVoteExpiryResolver } from '@/hooks/useVoteExpiryResolver';
import { useTrainingMilestone } from '@/hooks/useTrainingMilestone';
import { toDisplayUpper } from '@/lib/dictionary/normalize';
import { getCachedRoundPlayableLexicon } from '@/lib/dictionary/round-playable-lexicon-cache';
import { playWordAcceptedFeedback } from '@/lib/feedback/game-feedback';
import { ensureAnonymousAuth } from '@/lib/firebase/auth';
import { getServerNow } from '@/lib/firebase/server-clock';
import {
  finishGameSession,
  finishGameSessionIfExpired,
  leaveGameSession,
  syncSessionPlayerScores,
  type GameSessionSnapshot,
} from '@/lib/firebase/game-session-service';
import { mergeSessionWithWordMaps } from '@/lib/firebase/session-word-maps';
import { resolveGameSessionSettingsForSession } from '@/lib/firebase/session-settings';
import type { SessionWordMaps } from '@/lib/firebase/types';
import { exitOnlineToHome } from '@/lib/online/exit-online-flow';
import { markPendingRoundArchive } from '@/lib/online/session/pending-round-archive';
import {
  cacheActiveRoundProgress,
  purgeStaleActiveRoundCaches,
  tryRestoreActiveRoundCache,
} from '@/lib/online/session/cache-active-round';
import {
  hasOnlineOpponent,
  onlineActiveOpponentNames,
} from '@/lib/online/presence/session-presence';
import { hasMultiplayerRound } from '@/lib/online/presence/live-round-membership';
import { onlineResultsRoute } from '@/lib/online/online-results-route';
import { isReviewingPriorRoundOnPlayScreen } from '@/lib/online/session/is-reviewing-prior-round-on-play';
import { resolveRoundEndSessionSnapshot } from '@/lib/online/session/resolve-round-end-session-snapshot';
import { shouldKeepFrozenResultsOverLiveFinished } from '@/lib/online/session/frozen-round-view';
import { consumePlaySessionBootstrap } from '@/lib/online/session/play-session-bootstrap';
import {
  submitOnlineWord,
  reconcileOwnPlayerWordsWithSession,
  type StoredPlayerWord,
} from '@/lib/firebase/player-words-service';
import { archiveFinishedRoundFromFirebase } from '@/lib/online/session/archive-finished-round-from-firebase';
import {
  cancelAddTimeVote,
  cancelEarlyFinishVote,
  cancelPauseVote,
  cancelResumeVote,
  proposeAddTime,
  proposeEarlyFinish,
  proposePause,
  proposeResume,
  voteAddTime,
  voteEarlyFinish,
  votePause,
  voteResume,
} from '@/lib/firebase/session-votes-service';
import { buildOnlineWordListDisplay } from '@/lib/online/online-word-display';
import { displayPlayerName } from '@/lib/online/public-lobby/display-player-name';
import { playerGenderForDisplay } from '@/lib/online/public-lobby/session-identity';
import {
  buildLiveStandingsFromSession,
  sessionPlayerScoresMatchWordMaps,
} from '@/lib/online/live-standings';
import { formatPlayRulesLabel } from '@/lib/online/play-rules-label';
import { shouldDeferClientTimerFinish } from '@/lib/online/voting/add-time-vote';
import {
  createSubmitWordProfile,
  flushSubmitLatencySummary,
} from '@/lib/online/submit-word-profile';
import { buildLetterKeys } from '@/lib/game/letter-keyboard';
import { formatStandingRowMeta } from '@/lib/game/format-play-stats';
import { formatPlayerLeftLabel } from '@/lib/game/vote-status-label';
import { acceptWord } from '@/lib/game/play-word';
import {
  playWordErrorMessage,
  playWordFeedbackVariant,
  type PlayWordFeedbackVariant,
} from '@/lib/game/play-word-feedback';
import {
  assignDisplayRanks,
  displayRankForPlayer,
  shouldShowPointUi,
  type PlayerStandings,
} from '@/lib/game/scoring';
import { useFirebaseStore } from '@/store/firebase-store';
import { useProfileStore } from '@/store/profile-store';
import { useSettingsStore } from '@/store/settings-store';

const VALIDATION_DEBOUNCE_MS = 1000;

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
  const [myWords, setMyWords] = useState<Map<string, StoredPlayerWord>>(new Map());
  const [loading, setLoading] = useState(playInit.loading);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [draftKeyIndices, setDraftKeyIndices] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackVariant, setFeedbackVariant] = useState<PlayWordFeedbackVariant>('default');
  const [showStandings, setShowStandings] = useState(false);
  const [showGameMenu, setShowGameMenu] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showEndEarlyConfirm, setShowEndEarlyConfirm] = useState(false);
  const [showAddTimeModal, setShowAddTimeModal] = useState(false);
  const [showStatsExplain, setShowStatsExplain] = useState(false);
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
  const playToasts = usePlaySessionToasts(sessionCore, session, myUid, !roundEnded);
  const sessionToasts = useMemo(
    () => [...playToasts, ...rematchToasts],
    [playToasts, rematchToasts],
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastValidatedDraft = useRef('');
  const syncInFlightRef = useRef(0);
  const pendingListenerWordRef = useRef<string | null>(null);
  const activeSubmitProfileRef = useRef<ReturnType<typeof createSubmitWordProfile>>(null);
  const finishAttemptedRef = useRef(false);
  const resultsNavigatedRef = useRef(false);
  const leftNavigatedRef = useRef(false);
  const leavingIntentionallyRef = useRef(false);
  const playRoundKeyRef = useRef<number | null>(null);
  const staleWordsReconcileKeyRef = useRef<string | null>(null);
  const scoresSyncInFlightRef = useRef(false);
  const scoresSyncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedArchiveRoundRef = useRef<number | null>(null);
  const wordMapsRef = useRef(wordMaps);
  wordMapsRef.current = wordMaps;
  const myWordsRef = useRef(myWords);
  myWordsRef.current = myWords;
  const draftKeyIndicesRef = useRef(draftKeyIndices);
  draftKeyIndicesRef.current = draftKeyIndices;

  const navigateAfterLeave = useCallback(() => {
    if (!gameId || leftNavigatedRef.current) {
      return;
    }
    leftNavigatedRef.current = true;
    router.replace({ pathname: '/online/left/[gameId]', params: { gameId } });
  }, [gameId]);

  const runIntentionalLeave = useCallback(() => {
    if (!myUid || !session || session.status !== 'playing') {
      return;
    }
    leavingIntentionallyRef.current = true;
    void markPendingRoundArchive(gameId, session.baseWordRound ?? 0, myUid);
    navigateAfterLeave();
    void (async () => {
      try {
        await cacheActiveRoundProgress(gameId, myUid, session, myWordsRef.current);
        await leaveGameSession(gameId, myUid);
      } catch (error) {
        if (__DEV__) {
          console.warn('runIntentionalLeave', error);
        }
      }
    })();
  }, [gameId, myUid, navigateAfterLeave, session]);

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

  useEffect(() => {
    const round = session?.baseWordRound ?? null;
    if (round == null) {
      return;
    }
    if (playRoundKeyRef.current !== null && playRoundKeyRef.current !== round) {
      resultsNavigatedRef.current = false;
      leftNavigatedRef.current = false;
      finishAttemptedRef.current = false;
      leavingIntentionallyRef.current = false;
      staleWordsReconcileKeyRef.current = null;
    }
    playRoundKeyRef.current = round;
  }, [session?.baseWordRound]);

  useEffect(() => {
    if (session?.status === 'finished') {
      setRoundOverPendingResults(true);
    }
  }, [session?.status]);

  useEffect(() => {
    if (!roundEnded) {
      setRoundEndWordsSnapshot(null);
      setRoundEndSessionSnapshot(null);
      return;
    }
    setRoundEndWordsSnapshot((prev) => {
      if (prev !== null) {
        return prev;
      }
      if (myWords.size === 0) {
        return null;
      }
      return new Map(myWords);
    });
  }, [myWords, roundEnded]);

  useEffect(() => {
    if (!gameId || session?.status !== 'finished') {
      return;
    }
    setRoundEndSessionSnapshot((prev) =>
      resolveRoundEndSessionSnapshot(prev, { ...session, id: gameId }),
    );
  }, [gameId, session]);

  const displaySession = useMemo(() => {
    if (roundEnded && roundEndSessionSnapshot) {
      return roundEndSessionSnapshot;
    }
    return session;
  }, [roundEnded, roundEndSessionSnapshot, session]);

  useEffect(() => {
    if (!gameId || !session || session.status !== 'finished') {
      return;
    }
    const liveRound = session.baseWordRound ?? 0;
    const frozenRound = roundEndSessionSnapshot?.baseWordRound;
    if (frozenRound != null && shouldKeepFrozenResultsOverLiveFinished(frozenRound, liveRound)) {
      return;
    }
    if (finishedArchiveRoundRef.current === liveRound) {
      return;
    }
    finishedArchiveRoundRef.current = liveRound;
    void archiveFinishedRoundFromFirebase(gameId, session).catch((error) => {
      if (__DEV__) {
        console.warn('archiveFinishedRoundFromFirebase', error);
      }
    });
  }, [gameId, roundEndSessionSnapshot?.baseWordRound, session]);

  const navigateToResults = useCallback(async () => {
    if (!gameId || resultsNavigatedRef.current || !session) {
      return;
    }
    if (session.status !== 'finished' && !roundOverPendingResults) {
      return;
    }
    resultsNavigatedRef.current = true;
    // Keep roundOverPendingResults true until unmount — clearing it switches displaySession to
    // the live rematch round (e.g. paused round 2) and opens PauseRoundModal, which can leave
    // an iOS ghost overlay blocking touches on the results screen after replace.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const archiveSession = roundEndSessionSnapshot ?? session;
    const viewingRound = archiveSession.baseWordRound ?? null;
    router.replace(onlineResultsRoute(gameId, viewingRound));
    try {
      if (archiveSession.status === 'finished') {
        await archiveFinishedRoundFromFirebase(gameId, archiveSession);
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('archiveFinishedRoundFromFirebase', error);
      }
    }
  }, [gameId, roundEndSessionSnapshot, roundOverPendingResults, session]);

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

  useEffect(() => {
    if (
      isPaused ||
      session?.status !== 'playing' ||
      endsAt === null ||
      shouldDeferClientTimerFinish({
        addTimeVote: session?.addTimeVote,
        showAddTimeModal,
      })
    ) {
      return undefined;
    }
    const tick = () => {
      if (finishAttemptedRef.current || getServerNow() >= endsAt) {
        if (!finishAttemptedRef.current) {
          void finishGameSessionIfExpired(gameId, wordMapsRef.current ?? undefined).then(
            (committed) => {
              if (committed) {
                finishAttemptedRef.current = true;
              }
            },
          );
        }
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
    };
  }, [endsAt, gameId, isPaused, session?.addTimeVote, session?.status, showAddTimeModal]);

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

  useEffect(() => {
    if (!gameId || !myUid || !session || session.status !== 'playing' || !wordMaps) {
      return;
    }
    if (sessionPlayerScoresMatchWordMaps(session) || scoresSyncInFlightRef.current) {
      return;
    }
    if (scoresSyncDebounceRef.current) {
      clearTimeout(scoresSyncDebounceRef.current);
    }
    scoresSyncDebounceRef.current = setTimeout(() => {
      scoresSyncDebounceRef.current = null;
      if (scoresSyncInFlightRef.current) {
        return;
      }
      const maps = wordMapsRef.current;
      if (!maps) {
        return;
      }
      scoresSyncInFlightRef.current = true;
      void syncSessionPlayerScores(gameId, maps).finally(() => {
        scoresSyncInFlightRef.current = false;
      });
    }, 400);
    return () => {
      if (scoresSyncDebounceRef.current) {
        clearTimeout(scoresSyncDebounceRef.current);
        scoresSyncDebounceRef.current = null;
      }
    };
  }, [gameId, myUid, session, wordMaps]);

  const displayRanks = useMemo(() => assignDisplayRanks(standings), [standings]);
  const playerRank = displayRankForPlayer(standings, myUid);
  const hasMultiplayerRoundUi =
    displaySession != null && myUid ? hasMultiplayerRound(displaySession, myUid) : false;
  const playRulesLabel = formatPlayRulesLabel(t, displaySession?.settings);

  const clearFeedback = useCallback(() => {
    setFeedback(null);
    setFeedbackVariant('default');
  }, []);
  usePlayWordFeedbackDismiss(feedback, feedbackVariant, clearFeedback);

  useEffect(() => {
    setOptimisticWords((prev) => {
      if (prev.size === 0) {
        return prev;
      }
      let changed = false;
      const next = new Map(prev);
      for (const normalized of prev.keys()) {
        if (myWords.has(normalized)) {
          next.delete(normalized);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    const pendingWord = pendingListenerWordRef.current;
    if (pendingWord && myWords.has(pendingWord)) {
      activeSubmitProfileRef.current?.mark('listener');
      activeSubmitProfileRef.current?.finish();
      activeSubmitProfileRef.current = null;
      pendingListenerWordRef.current = null;
    }
  }, [myWords]);

  const finishBackgroundSync = useCallback(() => {
    syncInFlightRef.current = Math.max(0, syncInFlightRef.current - 1);
    setBackgroundSyncing(syncInFlightRef.current > 0);
  }, []);

  const submitDraft = useCallback(
    (draftValue: string) => {
      if (
        !session ||
        session.status !== 'playing' ||
        resultsNavigatedRef.current ||
        !roundLexicon ||
        !myUid ||
        draftValue.length === 0
      ) {
        return;
      }
      if (draftValue === lastValidatedDraft.current) {
        return;
      }

      const profile = createSubmitWordProfile(draftValue);
      profile?.mark('debounce');
      activeSubmitProfileRef.current = profile;

      const playerWordsMap = new Map<string, readonly string[]>([
        [myUid, [...wordsForDisplay.keys()]],
      ]);
      const result = acceptWord({
        input: draftValue,
        baseWord: session.baseWord,
        playerId: myUid,
        uniqueBonusEnabled,
        playerWords: playerWordsMap,
        options: {
          minWordLength: 2,
          roundLexicon: roundLexicon?.words,
        },
        deps: {
          hasInDictionary: () => false,
        },
        lookupDisplayUpper: (word) => roundLexicon.displays.get(word) ?? toDisplayUpper(word),
      });
      profile?.mark('acceptWord');

      if (!result.accepted || !result.entry) {
        activeSubmitProfileRef.current = null;
        const message = playWordErrorMessage(t, result.error);
        if (message) {
          setFeedback(message);
          setFeedbackVariant(playWordFeedbackVariant(false, result.error));
        }
        return;
      }

      lastValidatedDraft.current = draftValue;
      const savedDraft = draftValue;
      const savedKeyIndices = [...draftKeyIndices];
      const display = result.display ?? toDisplayUpper(result.normalized);
      const optimisticWord: StoredPlayerWord = {
        display,
        at: Date.now(),
      };

      setOptimisticWords((prev) => {
        const next = new Map(prev);
        next.set(result.normalized, optimisticWord);
        return next;
      });
      setScrollRequest({ normalized: result.normalized, id: Date.now() });
      setDraft('');
      setDraftKeyIndices([]);
      setFeedback(t('game.wordAccepted'));
      setFeedbackVariant('success');
      playWordAcceptedFeedback(wordAcceptedFeedback);
      profile?.mark('optimisticUi');

      syncInFlightRef.current += 1;
      setBackgroundSyncing(true);
      pendingListenerWordRef.current = result.normalized;

      void submitOnlineWord(gameId, myUid, result.normalized, display, uniqueBonusEnabled, {
        profile,
      }).then((remote) => {
        finishBackgroundSync();
        profile?.mark('remoteDone');

        if (!remote.ok) {
          pendingListenerWordRef.current = null;
          profile?.finish();
          activeSubmitProfileRef.current = null;
          setOptimisticWords((prev) => {
            const next = new Map(prev);
            next.delete(result.normalized);
            return next;
          });
          setDraft(savedDraft);
          setDraftKeyIndices(savedKeyIndices);
          lastValidatedDraft.current = '';
          if (remote.error === 'DUPLICATE') {
            setFeedback(t('game.errorAlreadySubmitted'));
            setFeedbackVariant('default');
          }
          return;
        }

        lastValidatedDraft.current = '';
        if (myWordsRef.current.has(result.normalized)) {
          profile?.mark('listener');
          profile?.finish();
          activeSubmitProfileRef.current = null;
          pendingListenerWordRef.current = null;
        }
      });
    },
    [
      draftKeyIndices,
      finishBackgroundSync,
      gameId,
      myUid,
      roundLexicon,
      session,
      t,
      uniqueBonusEnabled,
      wordAcceptedFeedback,
      wordsForDisplay,
    ],
  );

  useEffect(() => {
    if (session?.status !== 'playing') {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      lastValidatedDraft.current = '';
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (draft.length === 0) {
      lastValidatedDraft.current = '';
      return;
    }
    debounceRef.current = setTimeout(() => {
      submitDraft(draft);
    }, VALIDATION_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [draft, session?.status, submitDraft]);

  const pressKey = useCallback(
    (index: number) => {
      if (
        roundEndedRef.current ||
        isPausedRef.current ||
        remainingMsRef.current <= 0 ||
        draftKeyIndicesRef.current.includes(index)
      ) {
        return;
      }
      const key = letterKeys[index];
      if (!key) {
        return;
      }
      setDraft((prev) => prev + key.value);
      setDraftKeyIndices((prev) => [...prev, index]);
      setFeedback(null);
    },
    [letterKeys],
  );

  const clearDraft = useCallback(() => {
    setDraft('');
    setDraftKeyIndices([]);
    setFeedback(null);
    lastValidatedDraft.current = '';
  }, []);

  const backspaceDraft = useCallback(() => {
    setDraft((prev) => prev.slice(0, -1));
    setDraftKeyIndices((prev) => prev.slice(0, -1));
    setFeedback(null);
  }, []);

  const leaveToHome = () => {
    setShowExitConfirm(false);
    setShowGameMenu(false);
    if (!myUid || !session) {
      router.replace('/');
      return;
    }
    if (session.status === 'playing') {
      runIntentionalLeave();
      return;
    }
    void exitOnlineToHome({
      gameId,
      uid: myUid,
      isOrganizer: session.organizerId === myUid,
      sessionStatus: session.status,
      session,
      myWords,
    });
  };

  const cancelEarlyFinishProposal = () => {
    if (!myUid) {
      return;
    }
    void cancelEarlyFinishVote(gameId, myUid);
  };

  const cancelPauseProposal = () => {
    if (!myUid) {
      return;
    }
    void cancelPauseVote(gameId, myUid);
  };

  const cancelAddTimeProposal = () => {
    if (!myUid) {
      return;
    }
    void cancelAddTimeVote(gameId, myUid);
  };

  const cancelResumeProposal = () => {
    if (!myUid) {
      return;
    }
    void cancelResumeVote(gameId, myUid);
  };

  const leaveNowFromEarlyFinish = () => {
    if (!myUid || !session) {
      return;
    }
    void (async () => {
      try {
        await cancelEarlyFinishVote(gameId, myUid);
      } catch (error) {
        if (__DEV__) {
          console.warn('leaveNowFromEarlyFinish cancel vote', error);
        }
      }
      runIntentionalLeave();
    })();
  };

  const onVoteEarlyFinish = useCallback(
    (choice: 'yes' | 'no') => {
      if (!myUid) {
        return;
      }
      void voteEarlyFinish(gameId, myUid, choice);
    },
    [gameId, myUid],
  );

  const onVotePause = useCallback(
    (choice: 'yes' | 'no') => {
      if (!myUid) {
        return;
      }
      void votePause(gameId, myUid, choice);
    },
    [gameId, myUid],
  );

  const onVoteAddTime = useCallback(
    (choice: 'yes' | 'no') => {
      if (!myUid) {
        return;
      }
      void voteAddTime(gameId, myUid, choice);
    },
    [gameId, myUid],
  );

  const hasOnlineOpponentInRound = useMemo(
    () => (session && myUid ? hasOnlineOpponent(session, myUid) : false),
    [myUid, session],
  );

  useAutoPauseOnAppBackground(
    session?.status === 'playing' && !isPaused && !hasOnlineOpponentInRound,
    () => {
      void proposePause(gameId, myUid);
    },
  );

  useEffect(() => {
    if (!hasOnlineOpponentInRound) {
      return;
    }
    setShowEndEarlyConfirm((open) => {
      if (open && session && myUid) {
        const names = onlineActiveOpponentNames(session, myUid).join(', ');
        setFeedback(t('game.endEarlyOpponentOnline', { names }));
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(() => {
          clearFeedback();
        }, PLAY_WORD_FEEDBACK_DISMISS_MS);
      }
      return false;
    });
  }, [clearFeedback, hasOnlineOpponentInRound, myUid, session, t]);

  const handleEndEarlyConfirm = () => {
    setShowEndEarlyConfirm(false);
    if (session && myUid && hasOnlineOpponent(session, myUid)) {
      void proposeEarlyFinish(gameId, myUid);
      return;
    }
    void finishGameSession(gameId, wordMaps ?? undefined);
  };

  useEffect(() => {
    if (session?.status !== 'playing') {
      return;
    }
    const voteActive = Boolean(session.earlyFinishVote || session.pauseVote || session.addTimeVote);
    if (!voteActive) {
      return;
    }
    setShowAddTimeModal(false);
    setShowStandings(false);
  }, [session?.addTimeVote, session?.earlyFinishVote, session?.pauseVote, session?.status]);

  useEffect(() => {
    if (!roundEnded) {
      return;
    }
    setShowStandings(false);
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
            showRank={hasMultiplayerRoundUi}
            showScore={showPointUi}
            roundEnded={roundEnded}
            canProposeAddTime={canProposeAddTime}
            hasOpponent={hasMultiplayerRoundUi}
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
            showScoreBadges={showPointUi && hasMultiplayerRoundUi}
            showOverlapPeers={hasMultiplayerRoundUi}
            onPressKey={pressKey}
            onClearDraft={clearDraft}
            onBackspaceDraft={backspaceDraft}
          />
        </>
      ) : null}

      <BottomSheetModal
        visible={showStandings && !gameMenuBlockedByVote && !roundEnded}
        onClose={() => {
          setShowStandings(false);
        }}
      >
        <Text style={styles.modalTitle}>{t('game.standings')}</Text>
        {standings.map((row, index) => {
          const player = session.players[row.playerId];
          const name = player
            ? displayPlayerName(player, myUid, row.playerId, session)
            : row.playerId;
          const isMe = row.playerId === myUid;
          const presence = player?.online
            ? t('game.playerOnline')
            : player?.hasLeft
              ? formatPlayerLeftLabel(t, playerGenderForDisplay(session, myUid, row.playerId))
              : t('game.playerOffline');
          return (
            <View key={row.playerId} style={styles.standingRow}>
              <Text style={styles.standingRank}>{displayRanks.get(row.playerId) ?? index + 1}</Text>
              <View style={styles.standingMain}>
                <Text style={styles.standingName} numberOfLines={1}>
                  {name}
                  {isMe ? ` ${t('game.resultsYou')}` : ''}
                </Text>
                <Text style={styles.standingMeta}>
                  {presence} ·{' '}
                  {formatStandingRowMeta(row.wordCount, showPointUi ? row.score : null)}
                </Text>
              </View>
            </View>
          );
        })}
        <PrimaryButton
          label={t('common.close')}
          variant="secondary"
          onPress={() => {
            setShowStandings(false);
          }}
        />
      </BottomSheetModal>

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

      <PlayStatsExplainModal
        visible={showStatsExplain}
        wordCount={playerWordCount}
        maxWordCount={maxWordCount}
        showTrainingUnlockHint={false}
        onClose={() => {
          setShowStatsExplain(false);
        }}
      />

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
        hasOpponent={hasOnlineOpponentInRound}
        onCloseAddTime={() => {
          setShowAddTimeModal(false);
        }}
        onSelectAddTime={(minutes) => {
          void proposeAddTime(gameId, myUid, minutes);
        }}
        showEndEarlyConfirm={showEndEarlyConfirm}
        hasOnlineOpponentInRound={hasOnlineOpponentInRound}
        onEndEarlyConfirm={handleEndEarlyConfirm}
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
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    standingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderTertiary,
    },
    standingRank: {
      width: 20,
      fontWeight: '700',
      color: colors.accent,
    },
    standingMain: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    standingName: {
      fontSize: 15,
      color: colors.textPrimary,
    },
    standingMeta: {
      fontSize: 13,
      color: colors.textSecondary,
    },
  });
}
