import { router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from 'expo-router/react-navigation';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLiveRoundPlayScreen } from '@/hooks/useLiveRoundPlayScreen';
import { useRoundPlayableLexicon } from '@/hooks/useRoundPlayableLexicon';
import type { PlayableLexiconSnapshot } from '@/lib/dictionary/round-playable-lexicon';
import { GameMenuModal } from '@/components/GameMenuModal';
import { OnlinePlayActiveBody } from '@/components/online/OnlinePlayActiveBody';
import { OnlinePlayTimerHeader } from '@/components/online/OnlinePlayTimerHeader';
import { PlayStandingsSheet } from '@/components/online/PlayStandingsSheet';
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
import { useReconcileOpenVotesOnPresence } from '@/hooks/useReconcileOpenVotesOnPresence';
import { useTrainingMilestone } from '@/hooks/useTrainingMilestone';
import { toDisplayUpper } from '@/lib/dictionary/normalize';
import { getCachedRoundPlayableLexicon } from '@/lib/dictionary/round-playable-lexicon-cache';
import { playWordAcceptedFeedback } from '@/lib/feedback/game-feedback';
import { ensureAnonymousAuth } from '@/lib/firebase/auth';
import { getServerNow } from '@/lib/firebase/server-clock';
import {
  beginVoluntaryLeave,
  endVoluntaryLeave,
  finishGameSession,
  finishGameSessionIfExpired,
  leaveGameSession,
  readGameSessionSnapshot,
  syncSessionPlayerScores,
  tryReadGameSessionSnapshot,
  type GameSessionSnapshot,
} from '@/lib/firebase/game-session-service';
import { mergeSessionWithWordMaps } from '@/lib/firebase/session-word-maps';
import { resolveGameSessionSettingsForSession } from '@/lib/firebase/session-settings';
import type { SessionWordMaps } from '@/lib/firebase/types';
import { exitOnlineToHome } from '@/lib/online/exit-online-flow';
import { markPendingRoundArchive } from '@/lib/online/session/pending-round-archive';
import {
  cacheActiveRoundProgress,
  loadActiveRoundLexiconSnapshot,
  purgeStaleActiveRoundCaches,
  tryRestoreActiveRoundCache,
} from '@/lib/online/session/cache-active-round';
import {
  clearPausedOnlineResume,
  loadPausedOnlineResume,
  syncPausedOnlineResumePointer,
} from '@/lib/online/session/paused-online-resume';
import { normalizeRoomCode } from '@/lib/firebase/room-code';
import {
  hasOnlineOpponent,
  onlineActiveOpponentNames,
} from '@/lib/online/presence/session-presence';
import { hasMultiplayerRound } from '@/lib/online/presence/live-round-membership';
import { onlineResultsRoute } from '@/lib/online/online-results-route';
import { isReviewingPriorRoundOnPlayScreen } from '@/lib/online/session/is-reviewing-prior-round-on-play';
import { resolveRoundEndSessionSnapshot } from '@/lib/online/session/resolve-round-end-session-snapshot';
import { shouldKeepFrozenResultsOverLiveFinished } from '@/lib/online/session/frozen-round-view';
import {
  consumePlaySessionBootstrap,
  mergePlaySessionSubscription,
} from '@/lib/online/session/play-session-bootstrap';
import {
  clearLocalSessionVoteField,
  type LocalSessionVoteField,
} from '@/lib/online/voting/clear-local-session-vote';
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
import {
  buildLiveStandingsFromSession,
  sessionPlayerScoresMatchWordMaps,
} from '@/lib/online/live-standings';
import { formatPlayRulesLabel } from '@/lib/online/play-rules-label';
import {
  isGameMenuBlockedByVote,
  isPauseUiObscuredByOverlays,
  shouldShowPlayStandingsSheet,
} from '@/lib/online/play-menu-gates';
import {
  resolveAddTimePickerDismissAction,
  shouldDeferClientTimerFinish,
  shouldShowTimeUpModal,
} from '@/lib/online/voting/add-time-vote';
import { shouldClearPlayLocalWordsOnRoundChange } from '@/lib/online/play-round-local-reset';
import { ensureSessionFinishedForResults } from '@/lib/online/ensure-session-finished-for-results';
import type { OpenResultsEnsureOutcome } from '@/lib/online/ensure-session-finished-for-results';
import {
  ensureLocalArchiveForRematchAdvancedResults,
  resolveLocalFinishedSessionForResultsArchive,
} from '@/lib/online/ensure-rematch-advanced-results-archive';
import { beginExpireFinishAttempt } from '@/lib/online/play-expire-finish';
import { isRemoteRoundClockStillRunning } from '@/lib/online/play-remote-timer-alive';
import { syncDraftKeyIndicesRef } from '@/lib/game/sync-draft-key-indices-ref';
import {
  buildLocalTimeUpSessionSnapshot,
  resolveExpectedResultsBaseWordRound,
  shouldHoldPlayRoundKeyDuringLocalTimeUp,
  shouldSkipExpireFinishForPinnedTimeUp,
  shouldWriteFinishedRoundArchiveOnNavigate,
} from '@/lib/online/play-local-time-up';
import {
  canOpenOnlineResults,
  shouldBlockWordSubmitWhenTimerElapsed,
} from '@/lib/online/play-timer-submit-gate';
import {
  createSubmitWordProfile,
  flushSubmitLatencySummary,
} from '@/lib/online/submit-word-profile';
import { buildLetterKeys } from '@/lib/game/letter-keyboard';
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
import { VALIDATION_DEBOUNCE_MS } from '@/constants/game-timing';

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
  const [viewResultsBusy, setViewResultsBusy] = useState(false);
  const [viewResultsError, setViewResultsError] = useState<string | null>(null);
  const [roundEndWordsSnapshot, setRoundEndWordsSnapshot] = useState<Map<
    string,
    StoredPlayerWord
  > | null>(null);
  const [roundEndSessionSnapshot, setRoundEndSessionSnapshot] =
    useState<GameSessionSnapshot | null>(null);
  const [restoredLexiconSnapshot, setRestoredLexiconSnapshot] =
    useState<PlayableLexiconSnapshot | null>(null);
  const roundEnded = session?.status === 'finished' || roundOverPendingResults;
  const timeUpModalVisible = shouldShowTimeUpModal({
    roundEnded,
    showAddTimeModal,
  });
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
  /** Consecutive finishGameSessionIfExpired failures after the clock already elapsed. */
  const expiredFinishFailCountRef = useRef(0);
  /** Local time-up UI forced while RTDB may still be `playing` — keep retrying finish. */
  const localRoundOverForcedRef = useRef(false);
  /** Round pinned at local time-up — rematch must not rewrite expected results round. */
  const localTimeUpBaseWordRoundRef = useRef<number | null>(null);
  const [localTimeUpBaseWordRound, setLocalTimeUpBaseWordRound] = useState<number | null>(null);
  /** Prevent overlapping finishGameSessionIfExpired calls from interval + AppState. */
  const finishInFlightRef = useRef(false);
  /** Successful add-time propose — skip expire-finish on the modal's follow-up onClose. */
  const skipAddTimeDismissFinishRef = useRef(false);
  const resultsNavigatedRef = useRef(false);
  /** Guards double-tap while awaiting ensureSessionFinishedForResults. */
  const resultsNavInFlightRef = useRef(false);
  /** Bumped to abort in-flight navigateToResults (e.g. add-time clears time-up). */
  const resultsNavEpochRef = useRef(0);
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
  const showAddTimeModalRef = useRef(showAddTimeModal);
  showAddTimeModalRef.current = showAddTimeModal;
  const addTimeVoteRef = useRef(session?.addTimeVote);
  addTimeVoteRef.current = session?.addTimeVote;

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
    // Block presence-unmount offline before navigate so peers do not toast «не в грі»
    // between play unmount and leaveGameSession's atomic hasLeft write.
    beginVoluntaryLeave(gameId, myUid);
    void markPendingRoundArchive(gameId, session.baseWordRound ?? 0, myUid);
    navigateAfterLeave();
    void (async () => {
      try {
        await leaveGameSession(gameId, myUid);
        await cacheActiveRoundProgress(gameId, myUid, session, myWordsRef.current);
      } catch (error) {
        if (__DEV__) {
          console.warn('runIntentionalLeave', error);
        }
      } finally {
        endVoluntaryLeave(gameId, myUid);
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
    frozenBaseWordRound:
      roundEndSessionSnapshot?.baseWordRound ?? localTimeUpBaseWordRound ?? playRoundKeyRef.current,
    isFocused: isPlayScreenFocused,
    leavingIntentionallyRef,
    onJoinFailed: setLoadError,
  });

  useEffect(() => {
    if (!session || session.status !== 'playing' || !myUid) {
      setRestoredLexiconSnapshot(null);
      return undefined;
    }
    let cancelled = false;
    void loadActiveRoundLexiconSnapshot(gameId, session).then((snapshot) => {
      if (!cancelled) {
        setRestoredLexiconSnapshot(snapshot);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload lexicon when round identity changes
  }, [gameId, myUid, session?.baseWordRound, session?.status, session?.timerEndsAt]);

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
    if (
      shouldHoldPlayRoundKeyDuringLocalTimeUp({
        liveBaseWordRound: round,
        pinnedTimeUpRound: localTimeUpBaseWordRoundRef.current,
        roundOverPendingResults,
      })
    ) {
      // Rematch advanced while time-up modal is up — keep pinned round / modal / words.
      return;
    }
    if (shouldClearPlayLocalWordsOnRoundChange(playRoundKeyRef.current, round)) {
      resultsNavigatedRef.current = false;
      resultsNavInFlightRef.current = false;
      leftNavigatedRef.current = false;
      finishAttemptedRef.current = false;
      expiredFinishFailCountRef.current = 0;
      localRoundOverForcedRef.current = false;
      localTimeUpBaseWordRoundRef.current = null;
      setLocalTimeUpBaseWordRound(null);
      finishInFlightRef.current = false;
      leavingIntentionallyRef.current = false;
      staleWordsReconcileKeyRef.current = null;
      setOptimisticWords(new Map());
      setMyWords(new Map());
      setRoundEndWordsSnapshot(null);
      setRestoredLexiconSnapshot(null);
      setDraft('');
      setDraftKeyIndices([]);
      draftKeyIndicesRef.current = [];
      lastValidatedDraft.current = '';
      setFeedback(null);
      setViewResultsBusy(false);
      setViewResultsError(null);
    }
    playRoundKeyRef.current = round;
  }, [roundOverPendingResults, session?.baseWordRound]);

  useEffect(() => {
    if (session?.status === 'finished') {
      setRoundOverPendingResults(true);
      if (localTimeUpBaseWordRoundRef.current == null) {
        const round = session.baseWordRound ?? 0;
        localTimeUpBaseWordRoundRef.current = round;
        setLocalTimeUpBaseWordRound(round);
      }
    }
  }, [session?.status, session?.baseWordRound]);

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

  const forceLocalRoundOver = useCallback(() => {
    if (gameId && session) {
      const pinnedRound =
        localTimeUpBaseWordRoundRef.current ??
        playRoundKeyRef.current ??
        session.baseWordRound ??
        0;
      localTimeUpBaseWordRoundRef.current = pinnedRound;
      setLocalTimeUpBaseWordRound(pinnedRound);
      localRoundOverForcedRef.current = true;
      setRoundEndSessionSnapshot((prev) => {
        if (prev != null && (prev.baseWordRound ?? 0) === pinnedRound) {
          return prev;
        }
        return buildLocalTimeUpSessionSnapshot({ ...session, baseWordRound: pinnedRound }, gameId);
      });
    }
    setRoundOverPendingResults(true);
    setDraft('');
    setDraftKeyIndices([]);
    draftKeyIndicesRef.current = [];
    lastValidatedDraft.current = '';
    setFeedback(null);
  }, [gameId, session]);

  const clearElapsedDraft = useCallback(() => {
    setDraft('');
    setDraftKeyIndices([]);
    draftKeyIndicesRef.current = [];
    lastValidatedDraft.current = '';
    setFeedback(null);
  }, []);

  const navigateToResults = useCallback(async () => {
    if (!gameId || resultsNavigatedRef.current || resultsNavInFlightRef.current || !session) {
      return;
    }
    if (session.status !== 'finished' && !roundOverPendingResults) {
      return;
    }
    resultsNavInFlightRef.current = true;
    const navEpoch = resultsNavEpochRef.current;
    setViewResultsBusy(true);
    setViewResultsError(null);
    const expectedBaseWordRound = resolveExpectedResultsBaseWordRound({
      pinnedLocalTimeUpRound: localTimeUpBaseWordRoundRef.current,
      roundEndSnapshotRound: roundEndSessionSnapshot?.baseWordRound,
      liveBaseWordRound: session.baseWordRound,
    });
    try {
      // Local round-over alone must not open results while RTDB is still `playing`
      // (results spins until words bootstrap / finished — 20–30s hang for organizer).
      // Use pinned round — live baseWordRound may already be rematch N+1.
      let ensureOutcome: OpenResultsEnsureOutcome = 'already_finished';
      if (
        !canOpenOnlineResults(session.status) ||
        (session.baseWordRound ?? 0) > expectedBaseWordRound
      ) {
        // Already have a local finished pin — one snapshot classify, skip ~10s finish spam.
        if (localRoundOverForcedRef.current || roundEndSessionSnapshot?.status === 'finished') {
          try {
            const live = await readGameSessionSnapshot(gameId);
            if (navEpoch !== resultsNavEpochRef.current) {
              return;
            }
            if (
              canOpenOnlineResults(live.status) &&
              (live.baseWordRound ?? 0) === expectedBaseWordRound
            ) {
              ensureOutcome = 'finished';
            } else {
              ensureOutcome = 'rematch_advanced';
            }
          } catch {
            ensureOutcome = 'rematch_advanced';
          }
        } else {
          ensureOutcome = await ensureSessionFinishedForResults(
            gameId,
            wordMapsRef.current ?? undefined,
            { expectedBaseWordRound },
          );
          if (navEpoch !== resultsNavEpochRef.current) {
            return;
          }
          // Finish timeout: still open from local archive instead of trapping the user.
          if (ensureOutcome === 'timeout') {
            ensureOutcome = 'rematch_advanced';
          }
        }
      }
      // Keep roundOverPendingResults true until unmount — clearing it switches displaySession to
      // the live rematch round (e.g. paused round 2) and opens PauseRoundModal, which can leave
      // an iOS ghost overlay blocking touches on the results screen after replace.
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      let liveForArchive: GameSessionSnapshot | null = null;
      try {
        const live = await readGameSessionSnapshot(gameId);
        if (navEpoch !== resultsNavEpochRef.current) {
          return;
        }
        if (
          shouldWriteFinishedRoundArchiveOnNavigate({
            ensureOutcome,
            liveStatus: live.status,
            liveBaseWordRound: live.baseWordRound,
            expectedBaseWordRound,
          })
        ) {
          liveForArchive = live;
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('readGameSessionSnapshot before archive', error);
        }
      }
      if (navEpoch !== resultsNavEpochRef.current) {
        return;
      }
      // Archive must exist before replace — covers rematch_advanced and the
      // already_finished race (tap Results before the finished archive effect runs).
      let archiveReady = false;
      if (liveForArchive) {
        try {
          await archiveFinishedRoundFromFirebase(gameId, liveForArchive);
          archiveReady = true;
        } catch (error) {
          if (__DEV__) {
            console.warn('archiveFinishedRoundFromFirebase', error);
          }
        }
      }
      if (navEpoch !== resultsNavEpochRef.current) {
        return;
      }
      if (!archiveReady) {
        const localFinished = resolveLocalFinishedSessionForResultsArchive({
          gameId,
          expectedBaseWordRound,
          localFinishedSession: roundEndSessionSnapshot,
          liveSession: session,
        });
        archiveReady = await ensureLocalArchiveForRematchAdvancedResults({
          gameId,
          expectedBaseWordRound,
          localFinishedSession: localFinished,
          myUid,
          myWords: roundEndWordsSnapshot ?? myWordsRef.current,
        });
      }
      if (navEpoch !== resultsNavEpochRef.current) {
        return;
      }
      if (!archiveReady) {
        setViewResultsError(t('online.errorOpenResultsFailed'));
        return;
      }
      const viewingRound = liveForArchive?.baseWordRound ?? expectedBaseWordRound;
      try {
        router.replace(onlineResultsRoute(gameId, viewingRound));
        // Only lock out retries after replace succeeds — failed replace must allow retry.
        // Note: Expo Router replace rarely throws; busy may stick until unmount if nav no-ops.
        resultsNavigatedRef.current = true;
      } catch (error) {
        if (__DEV__) {
          console.warn('router.replace results', error);
        }
        setViewResultsError(t('online.errorOpenResultsFailed'));
        return;
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('navigateToResults', error);
      }
      if (navEpoch === resultsNavEpochRef.current) {
        setViewResultsError(t('online.errorOpenResultsFailed'));
      }
    } finally {
      if (!resultsNavigatedRef.current && navEpoch === resultsNavEpochRef.current) {
        resultsNavInFlightRef.current = false;
        setViewResultsBusy(false);
      }
    }
  }, [
    gameId,
    myUid,
    roundEndSessionSnapshot,
    roundEndWordsSnapshot,
    roundOverPendingResults,
    session,
    t,
  ]);

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
    archiveSnapshot: restoredLexiconSnapshot,
    enabled: Boolean(
      displaySession?.baseWord && (displaySession.status === 'playing' || roundEnded),
    ),
  });

  useEffect(() => {
    if (!session || session.status !== 'playing' || !myUid || !roundLexicon) {
      return;
    }
    void cacheActiveRoundProgress(gameId, myUid, session, myWordsRef.current);
  }, [gameId, myUid, roundLexicon, session]);

  const showPointUi = shouldShowPointUi(uniqueBonusEnabled);

  const isPaused = displaySession?.pauseState?.active === true;
  const reviewingPriorRound = isReviewingPriorRoundOnPlayScreen(
    roundEnded,
    roundEndSessionSnapshot?.baseWordRound ?? localTimeUpBaseWordRound,
    session?.baseWordRound ?? null,
  );
  const showLivePauseModal = isPaused && !reviewingPriorRound;

  useVoteExpiryResolver({
    gameId,
    enabled: !resultsNavigatedRef.current,
    earlyFinishVote: session?.earlyFinishVote,
    addTimeVote: session?.addTimeVote,
    resumeVote: session?.resumeVote,
    pauseVote: session?.pauseVote,
    pauseActive: isPaused,
    playing: session?.status === 'playing',
  });

  useReconcileOpenVotesOnPresence(gameId, session, !resultsNavigatedRef.current);

  useEffect(() => {
    if (
      session?.pauseVote ||
      session?.earlyFinishVote ||
      session?.addTimeVote ||
      (isPaused && session?.resumeVote)
    ) {
      setShowGameMenu(false);
    }
  }, [
    isPaused,
    session?.pauseVote,
    session?.earlyFinishVote,
    session?.addTimeVote,
    session?.resumeVote,
  ]);

  useEffect(() => {
    if (!session?.addTimeVote) {
      return;
    }
    // Allow finish retries after the vote clears; do not clear finishInFlight —
    // an in-flight finish's finally owns that bit (avoids overlapping expire calls).
    finishAttemptedRef.current = false;
    expiredFinishFailCountRef.current = 0;
    localRoundOverForcedRef.current = false;
    // Drop local time-up UI so vote is not under a stuck GameTimeUpModal.
    if (roundOverPendingResults && session.status === 'playing') {
      setRoundOverPendingResults(false);
      localTimeUpBaseWordRoundRef.current = null;
      setLocalTimeUpBaseWordRound(null);
      setRoundEndSessionSnapshot(null);
      setRoundEndWordsSnapshot(null);
      // Abort in-flight navigateToResults and clear stale modal error/busy.
      resultsNavEpochRef.current += 1;
      resultsNavInFlightRef.current = false;
      setViewResultsBusy(false);
      setViewResultsError(null);
    }
  }, [roundOverPendingResults, session?.addTimeVote, session?.status]);

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
  const maxWordCountLive = roundLexicon?.maxCount ?? cachedLexiconMaxCount;
  const maxWordCountRef = useRef<number | null>(null);
  if (maxWordCountLive != null) {
    maxWordCountRef.current = maxWordCountLive;
  }
  const maxWordCount = maxWordCountLive ?? maxWordCountRef.current;

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

  const syncSessionFromRtdb = useCallback(async () => {
    const snap = await tryReadGameSessionSnapshot(gameId);
    if (!snap) {
      return;
    }
    setSessionCore((prev) => mergePlaySessionSubscription(prev, snap));
  }, [gameId]);

  const resyncIfRemoteClockAlive = useCallback(async () => {
    const snap = await tryReadGameSessionSnapshot(gameId);
    if (!snap) {
      return false;
    }
    if (!isRemoteRoundClockStillRunning(snap, getServerNow())) {
      return false;
    }
    setSessionCore((prev) => mergePlaySessionSubscription(prev, snap));
    return true;
  }, [gameId]);

  const attemptExpireFinish = useCallback(() => {
    if (endsAt == null || session?.status !== 'playing') {
      return;
    }
    if (
      shouldSkipExpireFinishForPinnedTimeUp({
        roundOverPendingResults,
        pinnedTimeUpRound: localTimeUpBaseWordRoundRef.current,
        liveStatus: session.status,
        liveBaseWordRound: session.baseWordRound,
      })
    ) {
      return;
    }
    beginExpireFinishAttempt({
      endsAt,
      now: getServerNow(),
      deferFinish: shouldDeferClientTimerFinish({
        addTimeVote: addTimeVoteRef.current,
        showAddTimeModal: showAddTimeModalRef.current,
      }),
      refs: {
        finishAttempted: finishAttemptedRef,
        finishInFlight: finishInFlightRef,
        expiredFailCount: expiredFinishFailCountRef,
        localRoundOverForced: localRoundOverForcedRef,
        draftKeyIndices: draftKeyIndicesRef,
        lastValidatedDraft,
      },
      clearElapsedDraft,
      onLocalRoundOver: forceLocalRoundOver,
      finishIfExpired: () => finishGameSessionIfExpired(gameId, wordMapsRef.current ?? undefined),
      getNow: getServerNow,
      getDeferFinish: () =>
        shouldDeferClientTimerFinish({
          addTimeVote: addTimeVoteRef.current,
          showAddTimeModal: showAddTimeModalRef.current,
        }),
      resyncIfRemoteClockAlive,
    });
  }, [
    clearElapsedDraft,
    endsAt,
    forceLocalRoundOver,
    gameId,
    resyncIfRemoteClockAlive,
    roundOverPendingResults,
    session?.baseWordRound,
    session?.status,
  ]);

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
    attemptExpireFinish();
    const id = setInterval(attemptExpireFinish, 1000);
    return () => {
      clearInterval(id);
    };
  }, [
    attemptExpireFinish,
    endsAt,
    isPaused,
    session?.addTimeVote,
    session?.status,
    showAddTimeModal,
  ]);

  // After screen-off across timer end, run finish tick immediately on foreground.
  useEffect(() => {
    if (!gameId || session?.status !== 'playing' || endsAt == null) {
      return undefined;
    }
    const onAppState = (next: string) => {
      if (next !== 'active') {
        return;
      }
      attemptExpireFinish();
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      sub.remove();
    };
  }, [attemptExpireFinish, endsAt, gameId, session?.status]);

  const openGameMenu = useCallback(() => {
    const live = session;
    if (
      live &&
      isGameMenuBlockedByVote({
        pauseVote: live.pauseVote,
        earlyVote: live.earlyFinishVote,
        addTimeVote: live.addTimeVote,
        isPaused: isPausedRef.current,
        resumeVote: live.resumeVote,
      })
    ) {
      return;
    }
    setShowGameMenu(true);
  }, [session]);
  const openAddTimeModal = useCallback(() => {
    setShowAddTimeModal(true);
  }, []);

  const finishRoundAfterAddTimePickerDismiss = useCallback(() => {
    const action = resolveAddTimePickerDismissAction({
      sessionStatus: session?.status,
      timerEndsAt: endsAt,
      now: getServerNow(),
      addTimeVoteActive: Boolean(session?.addTimeVote),
    });
    if (action !== 'finish_round') {
      return;
    }
    forceLocalRoundOver();
    setShowAddTimeModal(false);
    if (gameId && session?.status === 'playing') {
      void finishGameSessionIfExpired(gameId, wordMapsRef.current ?? undefined);
    }
  }, [endsAt, forceLocalRoundOver, gameId, session?.addTimeVote, session?.status]);

  const handleSelectAddTime = useCallback(
    async (minutes: number) => {
      if (!gameId || !myUid) {
        return;
      }
      const proposed = await proposeAddTime(gameId, myUid, minutes);
      if (proposed) {
        skipAddTimeDismissFinishRef.current = true;
        return;
      }
      finishRoundAfterAddTimePickerDismiss();
    },
    [finishRoundAfterAddTimePickerDismiss, gameId, myUid],
  );

  const handleCloseAddTimeModal = useCallback(() => {
    setShowAddTimeModal(false);
    if (skipAddTimeDismissFinishRef.current) {
      skipAddTimeDismissFinishRef.current = false;
      return;
    }
    finishRoundAfterAddTimePickerDismiss();
  }, [finishRoundAfterAddTimePickerDismiss]);

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
      if (
        shouldBlockWordSubmitWhenTimerElapsed({
          remainingMs: remainingMsRef.current,
          roundEnded: roundEndedRef.current,
        })
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
      // Must clear ref before the next press — state updates are async; otherwise
      // keys from the accepted word stay "used" while the draft text was reset
      // (e.g. ПІ accepted → type ТО → П still grayed).
      setDraftKeyIndices(syncDraftKeyIndicesRef(draftKeyIndicesRef, []));
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
          setDraftKeyIndices(syncDraftKeyIndicesRef(draftKeyIndicesRef, savedKeyIndices));
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
      // Sync before re-render so a second press in the same gesture cannot reuse this key.
      draftKeyIndicesRef.current = [...draftKeyIndicesRef.current, index];
      setDraft((prev) => prev + key.value);
      setDraftKeyIndices(draftKeyIndicesRef.current);
      setFeedback(null);
    },
    [letterKeys],
  );

  const clearDraft = useCallback(() => {
    setDraft('');
    setDraftKeyIndices([]);
    draftKeyIndicesRef.current = [];
    setFeedback(null);
    lastValidatedDraft.current = '';
  }, []);

  const backspaceDraft = useCallback(() => {
    setDraft((prev) => prev.slice(0, -1));
    setDraftKeyIndices((prev) => {
      const next = prev.slice(0, -1);
      draftKeyIndicesRef.current = next;
      return next;
    });
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

  const cancelSessionVoteProposal = useCallback(
    async (field: LocalSessionVoteField, cancel: () => Promise<void>) => {
      setSessionCore((prev) => (prev ? clearLocalSessionVoteField(prev, field) : null));
      try {
        await cancel();
      } catch (error) {
        if (__DEV__) {
          console.warn('cancelSessionVoteProposal', field, error);
        }
      }
      await syncSessionFromRtdb();
    },
    [syncSessionFromRtdb],
  );

  const cancelEarlyFinishProposal = () => {
    if (!myUid) {
      return;
    }
    void cancelSessionVoteProposal('earlyFinishVote', () => cancelEarlyFinishVote(gameId, myUid));
  };

  const cancelPauseProposal = () => {
    if (!myUid) {
      return;
    }
    void cancelSessionVoteProposal('pauseVote', () => cancelPauseVote(gameId, myUid));
  };

  const cancelAddTimeProposal = () => {
    if (!myUid) {
      return;
    }
    void cancelSessionVoteProposal('addTimeVote', () => cancelAddTimeVote(gameId, myUid));
  };

  const cancelResumeProposal = () => {
    if (!myUid) {
      return;
    }
    void cancelSessionVoteProposal('resumeVote', () => cancelResumeVote(gameId, myUid));
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
      void (async () => {
        await voteEarlyFinish(gameId, myUid, choice);
        await syncSessionFromRtdb();
      })();
    },
    [gameId, myUid, syncSessionFromRtdb],
  );

  const onVotePause = useCallback(
    (choice: 'yes' | 'no') => {
      if (!myUid) {
        return;
      }
      void (async () => {
        await votePause(gameId, myUid, choice);
        await syncSessionFromRtdb();
      })();
    },
    [gameId, myUid, syncSessionFromRtdb],
  );

  const onVoteAddTime = useCallback(
    (choice: 'yes' | 'no') => {
      if (!myUid) {
        return;
      }
      void (async () => {
        await voteAddTime(gameId, myUid, choice);
        await syncSessionFromRtdb();
      })();
    },
    [gameId, myUid, syncSessionFromRtdb],
  );

  const hasOnlineOpponentInRound = useMemo(
    () => (session && myUid ? hasOnlineOpponent(session, myUid) : false),
    [myUid, session],
  );

  useAutoPauseOnAppBackground(
    session?.status === 'playing' && !isPaused && !hasOnlineOpponentInRound,
    () => {
      void (async () => {
        await proposePause(gameId, myUid);
        await syncSessionFromRtdb();
      })();
    },
  );

  useEffect(() => {
    if (!myUid || !session) {
      return;
    }
    if (session.status === 'playing' && session.pauseState?.active) {
      void syncPausedOnlineResumePointer(gameId, myUid, session);
      return;
    }
    void (async () => {
      const pointer = await loadPausedOnlineResume();
      if (pointer && normalizeRoomCode(pointer.gameId) === normalizeRoomCode(gameId)) {
        await clearPausedOnlineResume();
      }
    })();
  }, [
    gameId,
    myUid,
    session,
    session?.status,
    session?.pauseState?.active,
    session?.baseWordRound,
  ]);

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
    setShowStatsExplain(false);
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
  const gameMenuBlockedByVote = isGameMenuBlockedByVote({
    pauseVote,
    earlyVote,
    addTimeVote,
    isPaused,
    resumeVote,
  });
  const pauseUiObscured = isPauseUiObscuredByOverlays({
    showGameMenu,
    gameMenuBlockedByVote,
    showInviteModal,
    showExitConfirm,
    showEndEarlyConfirm,
    hasOnlineOpponentInRound,
  });
  const canProposeAddTime = !isPaused && !earlyVote && !pauseVote && !addTimeVote;

  return (
    <View style={styles.root}>
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

        <PlayStandingsSheet
          visible={shouldShowPlayStandingsSheet({
            showStandings,
            roundEnded,
            gameMenuBlockedByVote,
          })}
          onClose={() => {
            setShowStandings(false);
          }}
          gameId={gameId}
          session={displaySession ?? session}
          myUid={myUid}
          standings={standings}
          displayRanks={displayRanks}
          showPointUi={showPointUi}
          maxPlayableWords={maxWordCount}
        />

        {showGameMenu && !gameMenuBlockedByVote ? (
          <GameMenuModal
            visible
            endGameLabel={
              hasOnlineOpponentInRound ? t('game.menuProposeEnd') : t('game.menuEndEarly')
            }
            showEndGame={hasOnlineOpponentInRound && !roundEnded}
            onClose={() => {
              setShowGameMenu(false);
            }}
            onPause={() => {
              setShowGameMenu(false);
              void (async () => {
                await proposePause(gameId, myUid);
                await syncSessionFromRtdb();
              })();
            }}
            onProposeEnd={() => {
              setShowGameMenu(false);
              if (hasOnlineOpponentInRound) {
                void (async () => {
                  await proposeEarlyFinish(gameId, myUid);
                  await syncSessionFromRtdb();
                })();
              } else {
                setShowEndEarlyConfirm(true);
              }
            }}
            showPause={!isPaused && !earlyVote && !pauseVote && !addTimeVote && !roundEnded}
            pauseLabel={hasOnlineOpponentInRound ? t('game.menuPause') : t('game.menuPauseSolo')}
            showInvite={canInviteOthers && !roundEnded}
            showExit={!roundEnded}
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

        <PlayStatsExplainModal
          visible={showStatsExplain && !roundEnded}
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
          onCloseAddTime={handleCloseAddTimeModal}
          onSelectAddTime={handleSelectAddTime}
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
          viewResultsBusy={viewResultsBusy}
          viewResultsError={viewResultsError}
          onGoHomeFromTimeUp={leaveToHome}
        />
      </SafeAreaView>

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
            void (async () => {
              await proposeResume(gameId, myUid);
              await syncSessionFromRtdb();
            })();
          }}
          onResumeYes={() => {
            void (async () => {
              await voteResume(gameId, myUid, 'yes');
              await syncSessionFromRtdb();
            })();
          }}
          onResumeNo={() => {
            void (async () => {
              await voteResume(gameId, myUid, 'no');
              await syncSessionFromRtdb();
            })();
          }}
          onCancelResumeProposal={
            resumeVote?.proposedBy === myUid ? cancelResumeProposal : undefined
          }
          onEarlyFinishYes={() => {
            void (async () => {
              await voteEarlyFinish(gameId, myUid, 'yes');
              await syncSessionFromRtdb();
            })();
          }}
          onEarlyFinishNo={() => {
            void (async () => {
              await voteEarlyFinish(gameId, myUid, 'no');
              await syncSessionFromRtdb();
            })();
          }}
          onCancelEarlyFinishProposal={
            earlyVote?.proposedBy === myUid ? cancelEarlyFinishProposal : undefined
          }
          onLeaveNowFromEarlyFinish={
            earlyVote?.proposedBy === myUid ? leaveNowFromEarlyFinish : undefined
          }
          onOpenMenu={openGameMenu}
          canOpenMenu={!gameMenuBlockedByVote}
          onOpenSettings={() => {
            router.push('/settings');
          }}
        />
      ) : null}
    </View>
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
    root: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
    },
  });
}
