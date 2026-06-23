import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  hasWordInSortedList,
  loadBundledDictionary,
  loadBundledSupplements,
} from '@/services/dictionary-service';
import { AddTimeModal } from '@/components/AddTimeModal';
import { AddTimeVoteModal } from '@/components/AddTimeVoteModal';
import { BottomSheetModal } from '@/components/BottomSheetModal';
import { CenterDialogModal } from '@/components/CenterDialogModal';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { GameMenuModal } from '@/components/GameMenuModal';
import { GamePlayStatusBar } from '@/components/GamePlayStatusBar';
import { GameTimeUpModal } from '@/components/GameTimeUpModal';
import { EarlyFinishVoteModal } from '@/components/EarlyFinishVoteModal';
import { PlaySessionToastStack } from '@/components/PlaySessionToast';
import { PauseRoundModal } from '@/components/PauseRoundModal';
import { PauseVoteModal } from '@/components/PauseVoteModal';
import { RoomInviteModal } from '@/components/RoomInviteModal';
import { OnlinePlayComposePanel } from '@/components/online/OnlinePlayComposePanel';
import { OnlinePlayWordListSection } from '@/components/online/OnlinePlayWordListSection';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, radii, spacing } from '@/constants/theme';
import { useAutoPauseOnAppBackground } from '@/hooks/useAutoPauseOnAppBackground';
import { usePlaySessionToasts } from '@/hooks/usePlaySessionToasts';
import { useResultsRematchToast } from '@/hooks/useResultsRematchToast';
import { useServerNow } from '@/hooks/useServerNow';
import { useRoundTimeUpModal } from '@/hooks/useRoundTimeUpModal';
import { useTimerAlerts } from '@/hooks/useTimerAlerts';
import { DictionaryIndex } from '@/lib/dictionary/dictionary-index';
import { toDisplayUpper } from '@/lib/dictionary/normalize';
import { playWordAcceptedFeedback } from '@/lib/feedback/game-feedback';
import { ensureAnonymousAuth } from '@/lib/firebase/auth';
import {
  finishGameSession,
  finishGameSessionIfExpired,
  leaveGameSession,
  rejoinExistingPlayer,
  subscribeGameSession,
  syncSessionPlayerScores,
  type GameSessionSnapshot,
} from '@/lib/firebase/game-session-service';
import { mergeSessionWithWordMaps } from '@/lib/firebase/session-word-maps';
import { subscribeSessionWordMaps } from '@/lib/firebase/session-word-maps-service';
import { resolveGameSessionSettingsForSession } from '@/lib/firebase/session-settings';
import type { SessionWordMaps } from '@/lib/firebase/types';
import { exitOnlineToHome } from '@/lib/online/exit-online-flow';
import { markPendingRoundArchive } from '@/lib/online/pending-round-archive';
import {
  cacheActiveRoundProgress,
  purgeStaleActiveRoundCaches,
  tryRestoreActiveRoundCache,
} from '@/lib/online/cache-active-round';
import { usePlayerOnlinePresence } from '@/lib/online/use-player-online-presence';
import { hasOnlineOpponent, onlineActiveOpponentNames } from '@/lib/online/session-presence';
import {
  submitOnlineWord,
  subscribePlayerWords,
  reconcileOwnPlayerWordsWithSession,
  type StoredPlayerWord,
} from '@/lib/firebase/player-words-service';
import { archiveFinishedRoundFromFirebase } from '@/lib/online/archive-finished-round-from-firebase';
import {
  cancelAddTimeVote,
  cancelEarlyFinishVote,
  cancelPauseVote,
  cancelResumeVote,
  proposeAddTime,
  proposeEarlyFinish,
  proposePause,
  proposeResume,
  resolveAddTimeVoteIfExpired,
  resolveEarlyFinishVoteIfExpired,
  resolveResumeVoteIfExpired,
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
  createSubmitWordProfile,
  flushSubmitLatencySummary,
} from '@/lib/online/submit-word-profile';
import { buildLetterKeys, computeLetterKeySize } from '@/lib/game/letter-keyboard';
import { letterKeyFontSizeForKeySize } from '@/lib/game/letter-key-style';
import { acceptWord, type PlayWordErrorCode } from '@/lib/game/play-word';
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
const FEEDBACK_DISMISS_MS = 2200;

/**
 * Online multiplayer play — per-device keyboard, Firebase sync (M2.3).
 */
export default function OnlinePlayScreen() {
  const { t } = useTranslation();
  const { gameId: rawGameId, openInvite: rawOpenInvite } = useLocalSearchParams<{
    gameId: string;
    openInvite?: string;
  }>();
  const gameId = rawGameId ?? '';
  const myUid = useFirebaseStore((state) => state.uid) ?? '';
  const { width: screenWidth } = useWindowDimensions();
  const composeKeySize = computeLetterKeySize(screenWidth);
  const composeKeyFontSize = letterKeyFontSizeForKeySize(composeKeySize);
  const wordAcceptedFeedback = useSettingsStore((state) => state.wordAcceptedFeedback);
  const timerAlertMode = useSettingsStore((state) => state.timerAlertMode);
  const viewerGender = useProfileStore((state) => state.gender);

  const [sessionCore, setSessionCore] = useState<GameSessionSnapshot | null>(null);
  const [wordMaps, setWordMaps] = useState<SessionWordMaps | null>(null);
  const session = useMemo(
    () => (sessionCore ? mergeSessionWithWordMaps(sessionCore, wordMaps) : null),
    [sessionCore, wordMaps],
  );
  const [myWords, setMyWords] = useState<Map<string, StoredPlayerWord>>(new Map());
  const [loading, setLoading] = useState(true);
  const [dictionary, setDictionary] = useState<DictionaryIndex | null>(null);
  const [properNouns, setProperNouns] = useState<string[]>([]);
  const [slang, setSlang] = useState<string[]>([]);
  const [supplementsReady, setSupplementsReady] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftKeyIndices, setDraftKeyIndices] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showStandings, setShowStandings] = useState(false);
  const [showGameMenu, setShowGameMenu] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showEndEarlyConfirm, setShowEndEarlyConfirm] = useState(false);
  const [showAddTimeModal, setShowAddTimeModal] = useState(false);
  const [backgroundSyncing, setBackgroundSyncing] = useState(false);
  const [optimisticWords, setOptimisticWords] = useState<Map<string, StoredPlayerWord>>(new Map());
  const [scrollRequest, setScrollRequest] = useState<{ normalized: string; id: number } | null>(
    null,
  );
  const serverNow = useServerNow(250);
  const [roundOverPendingResults, setRoundOverPendingResults] = useState(false);
  const roundEnded = session?.status === 'finished' || roundOverPendingResults;
  const { timeUpModalVisible } = useRoundTimeUpModal(roundEnded);
  const skipRematchToastRef = useRef(false);
  const rematchToasts = useResultsRematchToast(sessionCore, skipRematchToastRef);
  const playToasts = usePlaySessionToasts(session, myUid);
  const sessionToasts = useMemo(
    () => [...playToasts, ...rematchToasts],
    [playToasts, rematchToasts],
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastValidatedDraft = useRef('');
  const submittingRef = useRef(false);
  const pendingSubmitDraftRef = useRef<string | null>(null);
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
    if (rawOpenInvite === '1') {
      setShowInviteModal(true);
    }
  }, [rawOpenInvite]);

  useEffect(() => {
    void purgeStaleActiveRoundCaches();
  }, []);

  const staleHasLeftReconcileRef = useRef<string | null>(null);

  const myHasLeft = session?.players[myUid]?.hasLeft === true;
  usePlayerOnlinePresence(
    gameId,
    myUid,
    Boolean(
      gameId &&
      myUid &&
      session?.status === 'playing' &&
      !myHasLeft &&
      !leavingIntentionallyRef.current,
    ),
  );

  useEffect(() => {
    if (!gameId || !myUid || !session || session.status !== 'playing') {
      return;
    }
    if (session.players[myUid]?.hasLeft !== true) {
      return;
    }
    const roundKey = `${session.baseWordRound ?? 0}:${session.timerEndsAt ?? 0}`;
    if (staleHasLeftReconcileRef.current === roundKey) {
      return;
    }
    staleHasLeftReconcileRef.current = roundKey;
    const { name, gender, avatarColorIndex } = useProfileStore.getState();
    void rejoinExistingPlayer(gameId, myUid, { name, gender, avatarColorIndex }).catch((error) => {
      staleHasLeftReconcileRef.current = null;
      if (__DEV__) {
        console.warn('rejoinExistingPlayer stale hasLeft', error);
      }
    });
  }, [gameId, myUid, session]);

  useEffect(() => {
    if (!gameId || !myUid) {
      return undefined;
    }
    let cancelled = false;
    let unsubSession: (() => void) | undefined;
    let unsubMaps: (() => void) | undefined;
    let unsubWords: (() => void) | undefined;

    void ensureAnonymousAuth().then(() => {
      if (cancelled) {
        return;
      }
      unsubSession = subscribeGameSession(gameId, (next) => {
        setSessionCore(next);
        setLoading(false);
      });
      unsubMaps = subscribeSessionWordMaps(gameId, setWordMaps);
      unsubWords = subscribePlayerWords(gameId, myUid, setMyWords);
    });

    return () => {
      cancelled = true;
      unsubSession?.();
      unsubMaps?.();
      unsubWords?.();
    };
  }, [gameId, myUid]);

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
    if (!gameId || !session || session.status !== 'finished') {
      return;
    }
    const round = session.baseWordRound ?? 0;
    if (finishedArchiveRoundRef.current === round) {
      return;
    }
    finishedArchiveRoundRef.current = round;
    void archiveFinishedRoundFromFirebase(gameId, session).catch((error) => {
      if (__DEV__) {
        console.warn('archiveFinishedRoundFromFirebase', error);
      }
    });
  }, [gameId, session]);

  const navigateToResults = useCallback(async () => {
    if (!gameId || resultsNavigatedRef.current || !session) {
      return;
    }
    if (session.status !== 'finished' && !roundOverPendingResults) {
      return;
    }
    resultsNavigatedRef.current = true;
    setRoundOverPendingResults(false);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    try {
      if (session.status === 'finished') {
        await archiveFinishedRoundFromFirebase(gameId, session);
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('archiveFinishedRoundFromFirebase', error);
      }
    }
    router.replace({ pathname: '/online/results/[gameId]', params: { gameId } });
  }, [gameId, roundOverPendingResults, session]);

  useEffect(() => {
    void Promise.all([loadBundledDictionary(), loadBundledSupplements()]).then(
      ([dict, supplements]) => {
        setDictionary(dict);
        setProperNouns(supplements.properNouns);
        setSlang(supplements.slang);
        setSupplementsReady(true);
      },
    );
  }, []);

  const endsAt = session?.timerEndsAt ?? null;
  const uniqueBonusEnabled = session
    ? resolveGameSessionSettingsForSession(session).uniqueBonusEnabled
    : false;
  const showPointUi = shouldShowPointUi(uniqueBonusEnabled);

  const isPaused = session?.pauseState?.active === true;

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
      serverNow < endsAt ||
      session?.addTimeVote
    ) {
      return;
    }
    if (!finishAttemptedRef.current) {
      void finishGameSessionIfExpired(gameId, wordMapsRef.current ?? undefined).then(
        (committed) => {
          if (committed) {
            finishAttemptedRef.current = true;
          }
        },
      );
    }
  }, [endsAt, gameId, isPaused, serverNow, session?.addTimeVote, session?.status]);

  const baseWord = session?.baseWord ?? '';
  const baseWordDisplay = dictionary?.lookupDisplayUpper(baseWord) ?? toDisplayUpper(baseWord);
  const letterKeys = useMemo(() => buildLetterKeys(baseWordDisplay), [baseWordDisplay]);

  const wordsForDisplay = useMemo(() => {
    if (optimisticWords.size === 0) {
      return myWords;
    }
    const merged = new Map(myWords);
    for (const [normalized, word] of optimisticWords) {
      if (!merged.has(normalized)) {
        merged.set(normalized, word);
      }
    }
    return merged;
  }, [myWords, optimisticWords]);

  const { entries: scoredWords, displays } = useMemo(() => {
    if (!session) {
      return { entries: [], displays: [] };
    }
    return buildOnlineWordListDisplay(wordsForDisplay, session, myUid);
  }, [myUid, session, wordsForDisplay]);

  const myPlayer = session?.players[myUid];
  const standings = useMemo((): PlayerStandings[] => {
    if (!session) {
      return [];
    }
    return buildLiveStandingsFromSession(session);
  }, [session]);

  const playerScore = standings.find((row) => row.playerId === myUid)?.score ?? 0;
  // Local word list is authoritative for the viewer — avoids flicker when session totals lag maps.
  const playerWordCount =
    wordsForDisplay.size > 0 ? wordsForDisplay.size : (myPlayer?.wordCount ?? 0);
  const myName = myPlayer?.name ?? t('profile.namePlaceholder');

  const remainingMs = isPaused
    ? (session?.pauseState?.frozenRemainingMs ?? 0)
    : endsAt
      ? Math.max(0, endsAt - serverNow)
      : 0;
  const remainingLabel = formatTimer(remainingMs);
  const timerUrgent = remainingMs > 0 && remainingMs <= 60_000;

  useTimerAlerts(remainingMs, isPaused, timerAlertMode, session?.status === 'playing');

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
  const hasOpponent = standings.length >= 2;
  const playRulesLabel = formatPlayRulesLabel(t, session?.settings);

  useEffect(() => {
    if (!feedback) {
      return;
    }
    const timer = setTimeout(() => {
      setFeedback(null);
    }, FEEDBACK_DISMISS_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [feedback]);

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

  const runPendingSubmit = useCallback((submitFn: (draftValue: string) => Promise<void>) => {
    const pending = pendingSubmitDraftRef.current;
    if (!pending || pending === lastValidatedDraft.current) {
      pendingSubmitDraftRef.current = null;
      return;
    }
    pendingSubmitDraftRef.current = null;
    void submitFn(pending);
  }, []);

  const submitDraft = useCallback(
    async (draftValue: string) => {
      if (
        !session ||
        session.status !== 'playing' ||
        resultsNavigatedRef.current ||
        !dictionary ||
        !supplementsReady ||
        !myUid ||
        draftValue.length === 0
      ) {
        return;
      }
      if (draftValue === lastValidatedDraft.current) {
        return;
      }
      if (submittingRef.current) {
        pendingSubmitDraftRef.current = draftValue;
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
        options: { minWordLength: 2 },
        deps: {
          hasInDictionary: (word) =>
            dictionary.hasWord(word) ||
            (session.settings.allowProperNouns && hasWordInSortedList(properNouns, word)) ||
            (session.settings.allowSlang && hasWordInSortedList(slang, word)),
        },
        lookupDisplayUpper: (word) => dictionary.lookupDisplayUpper(word) ?? toDisplayUpper(word),
      });
      profile?.mark('acceptWord');

      if (!result.accepted || !result.entry) {
        activeSubmitProfileRef.current = null;
        if (result.error === 'NOT_IN_DICTIONARY') {
          return;
        }
        const message = errorMessage(t, result.error);
        if (message) {
          setFeedback(message);
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
      playWordAcceptedFeedback(wordAcceptedFeedback);
      profile?.mark('optimisticUi');

      submittingRef.current = true;
      setBackgroundSyncing(true);
      pendingListenerWordRef.current = result.normalized;

      const remote = await submitOnlineWord(
        gameId,
        myUid,
        result.normalized,
        display,
        uniqueBonusEnabled,
        { profile },
      );

      submittingRef.current = false;
      setBackgroundSyncing(false);
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
        }
        runPendingSubmit(submitDraft);
        return;
      }

      lastValidatedDraft.current = '';
      if (myWordsRef.current.has(result.normalized)) {
        profile?.mark('listener');
        profile?.finish();
        activeSubmitProfileRef.current = null;
        pendingListenerWordRef.current = null;
      }
      runPendingSubmit(submitDraft);
    },
    [
      dictionary,
      draftKeyIndices,
      gameId,
      myUid,
      properNouns,
      runPendingSubmit,
      session,
      slang,
      supplementsReady,
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
      void submitDraft(draft);
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
        roundEnded ||
        isPaused ||
        remainingMs <= 0 ||
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
    [isPaused, letterKeys, remainingMs, roundEnded],
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
          setFeedback(null);
        }, FEEDBACK_DISMISS_MS);
      }
      return false;
    });
  }, [hasOnlineOpponentInRound, myUid, session, t]);

  const handleEndEarlyConfirm = () => {
    setShowEndEarlyConfirm(false);
    if (session && myUid && hasOnlineOpponent(session, myUid)) {
      void proposeEarlyFinish(gameId, myUid);
      return;
    }
    void finishGameSession(gameId, wordMaps ?? undefined);
  };

  useEffect(() => {
    if (
      resultsNavigatedRef.current ||
      !session?.earlyFinishVote ||
      session.status !== 'playing' ||
      !gameId
    ) {
      return undefined;
    }
    void resolveEarlyFinishVoteIfExpired(gameId);
    const timer = setInterval(() => {
      void resolveEarlyFinishVoteIfExpired(gameId);
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [gameId, session?.earlyFinishVote, session?.players, session?.status]);

  useEffect(() => {
    if (
      resultsNavigatedRef.current ||
      !session?.addTimeVote ||
      session.status !== 'playing' ||
      !gameId
    ) {
      return undefined;
    }
    void resolveAddTimeVoteIfExpired(gameId);
    const timer = setInterval(() => {
      void resolveAddTimeVoteIfExpired(gameId);
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [gameId, session?.addTimeVote, session?.players, session?.status]);

  useEffect(() => {
    if (
      resultsNavigatedRef.current ||
      !session?.resumeVote ||
      !session.pauseState?.active ||
      session.status !== 'playing' ||
      !gameId
    ) {
      return undefined;
    }
    void resolveResumeVoteIfExpired(gameId);
    const timer = setInterval(() => {
      void resolveResumeVoteIfExpired(gameId);
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [gameId, session?.pauseState?.active, session?.players, session?.resumeVote, session?.status]);

  if (loading || !session || !myUid) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (session.status !== 'playing' && !roundOverPendingResults) {
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
  const canProposeAddTime = !isPaused && !earlyVote && !pauseVote && !addTimeVote;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {!isPaused ? (
        <>
          {canProposeAddTime ? (
            <FeedbackPressable
              accessibilityRole="button"
              accessibilityLabel={t('game.addTimeTitle')}
              onPress={() => {
                setShowAddTimeModal(true);
              }}
            >
              <GamePlayStatusBar
                timerLabel={remainingLabel}
                timerUrgent={timerUrgent && !isPaused}
                rank={playerRank}
                wordCount={playerWordCount}
                score={playerScore}
                wordsShort={t('game.wordsShort')}
                pointsShort={t('game.pointsShort')}
                showRank={hasOpponent}
                showScore={showPointUi}
                style={{ marginHorizontal: -spacing.md }}
              />
            </FeedbackPressable>
          ) : (
            <GamePlayStatusBar
              timerLabel={remainingLabel}
              timerUrgent={timerUrgent && !isPaused}
              rank={playerRank}
              wordCount={playerWordCount}
              score={playerScore}
              wordsShort={t('game.wordsShort')}
              pointsShort={t('game.pointsShort')}
              showRank={hasOpponent}
              showScore={uniqueBonusEnabled && hasOpponent}
              style={{ marginHorizontal: -spacing.md }}
            />
          )}

          <View style={styles.footer}>
            {!roundEnded ? (
              <>
                <PrimaryButton
                  label={t('game.menu')}
                  variant="secondary"
                  style={hasOpponent ? styles.footerButton : styles.footerButtonSolo}
                  onPress={() => {
                    setShowGameMenu(true);
                  }}
                />
                {hasOpponent ? (
                  <PrimaryButton
                    label={t('game.standings')}
                    variant="secondary"
                    style={styles.footerButton}
                    onPress={() => {
                      setShowStandings(true);
                    }}
                  />
                ) : null}
              </>
            ) : null}
          </View>

          <View style={styles.playerHeader}>
            <Text style={styles.playerName} numberOfLines={1}>
              {myName}
            </Text>
            <Text style={styles.playRules} numberOfLines={2}>
              {playRulesLabel}
            </Text>
          </View>

          <OnlinePlayWordListSection
            entries={scoredWords}
            displays={displays}
            draftPrefix={draft}
            scrollToNormalized={scrollRequest?.normalized ?? null}
            scrollToRequestId={scrollRequest?.id}
            feedback={feedback}
            backgroundSyncing={backgroundSyncing}
            showScoreBadges={showPointUi && hasOpponent}
            showOverlapPeers={hasOpponent}
          />

          <OnlinePlayComposePanel
            draft={draft}
            draftKeyIndices={draftKeyIndices}
            letterKeys={letterKeys}
            composeKeySize={composeKeySize}
            composeKeyFontSize={composeKeyFontSize}
            onPressKey={pressKey}
            onClearDraft={clearDraft}
            onBackspaceDraft={backspaceDraft}
          />
        </>
      ) : null}

      <BottomSheetModal
        visible={showStandings}
        onClose={() => {
          setShowStandings(false);
        }}
      >
        <Text style={styles.modalTitle}>{t('game.standings')}</Text>
        {standings.map((row, index) => {
          const name = session.players[row.playerId]?.name ?? row.playerId;
          const isMe = row.playerId === myUid;
          return (
            <View key={row.playerId} style={styles.standingRow}>
              <Text style={styles.standingRank}>{displayRanks.get(row.playerId) ?? index + 1}</Text>
              <Text style={styles.standingName}>
                {name}
                {isMe ? ` ${t('game.resultsYou')}` : ''}
              </Text>
              <Text style={styles.standingMeta}>
                {row.wordCount}
                {t('game.wordsShort')}
                {showPointUi ? (
                  <>
                    {' · '}
                    {row.score}
                    {t('game.pointsShort')}
                  </>
                ) : null}
              </Text>
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

      <GameMenuModal
        visible={showGameMenu}
        endGameLabel={hasOnlineOpponentInRound ? t('game.menuProposeEnd') : t('game.menuEndEarly')}
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
        showInvite
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

      <RoomInviteModal
        visible={showInviteModal}
        roomCode={gameId}
        invitedByUid={myUid}
        roundInProgress={session.status === 'playing'}
        onClose={() => {
          setShowInviteModal(false);
        }}
      />

      <PauseRoundModal
        visible={isPaused}
        session={session}
        myUid={myUid}
        viewerGender={viewerGender}
        serverNow={serverNow}
        resumeVote={resumeVote}
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
        onCancelResumeProposal={resumeVote?.proposedBy === myUid ? cancelResumeProposal : undefined}
        onOpenMenu={() => {
          setShowGameMenu(true);
        }}
        onOpenSettings={() => {
          router.push('/settings');
        }}
      />

      {earlyVote ? (
        <EarlyFinishVoteModal
          visible
          session={session}
          vote={earlyVote}
          myUid={myUid}
          serverNow={serverNow}
          onYes={() => {
            void voteEarlyFinish(gameId, myUid, 'yes');
          }}
          onNo={() => {
            void voteEarlyFinish(gameId, myUid, 'no');
          }}
          onCancelProposal={earlyVote.proposedBy === myUid ? cancelEarlyFinishProposal : undefined}
          onLeaveNow={earlyVote.proposedBy === myUid ? leaveNowFromEarlyFinish : undefined}
        />
      ) : null}

      {pauseVote && !isPaused && !earlyVote && !addTimeVote ? (
        <PauseVoteModal
          visible
          session={session}
          vote={pauseVote}
          myUid={myUid}
          onYes={() => {
            void votePause(gameId, myUid, 'yes');
          }}
          onNo={() => {
            void votePause(gameId, myUid, 'no');
          }}
          onCancelProposal={pauseVote.proposedBy === myUid ? cancelPauseProposal : undefined}
        />
      ) : null}

      {addTimeVote && session.status === 'playing' && !isPaused && !earlyVote && !pauseVote ? (
        <AddTimeVoteModal
          visible
          session={session}
          vote={addTimeVote}
          myUid={myUid}
          serverNow={serverNow}
          onYes={() => {
            void voteAddTime(gameId, myUid, 'yes');
          }}
          onNo={() => {
            void voteAddTime(gameId, myUid, 'no');
          }}
          onCancelProposal={addTimeVote.proposedBy === myUid ? cancelAddTimeProposal : undefined}
        />
      ) : null}

      <AddTimeModal
        visible={showAddTimeModal}
        remainingMs={remainingMs}
        requiresConsensus={hasOpponent}
        onClose={() => {
          setShowAddTimeModal(false);
        }}
        onSelect={(minutes) => {
          void proposeAddTime(gameId, myUid, minutes);
        }}
      />

      <CenterDialogModal
        visible={showEndEarlyConfirm && !hasOnlineOpponentInRound}
        title={t('game.endEarlyConfirmTitle')}
        body={t('game.endEarlyConfirmBody')}
        primaryLabel={t('game.endEarlyConfirmAction')}
        onPrimary={handleEndEarlyConfirm}
        secondaryLabel={t('common.cancel')}
        onSecondary={() => {
          setShowEndEarlyConfirm(false);
        }}
        onRequestClose={() => {
          setShowEndEarlyConfirm(false);
        }}
      />

      <CenterDialogModal
        visible={showExitConfirm}
        title={t('online.exitConfirmTitle')}
        body={t('online.exitConfirmBody')}
        primaryLabel={t('online.exitConfirmAction')}
        onPrimary={leaveToHome}
        secondaryLabel={t('common.cancel')}
        onSecondary={() => {
          setShowExitConfirm(false);
        }}
        onRequestClose={() => {
          setShowExitConfirm(false);
        }}
      />

      <PlaySessionToastStack toasts={sessionToasts} />

      <GameTimeUpModal
        visible={timeUpModalVisible}
        onViewResults={() => {
          void navigateToResults();
        }}
      />
    </SafeAreaView>
  );
}

function formatTimer(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function errorMessage(
  t: (key: string) => string,
  code: PlayWordErrorCode | undefined,
): string | null {
  switch (code) {
    case 'TOO_SHORT':
    case 'NOT_IN_DICTIONARY':
      return null;
    case 'IS_BASE_WORD':
      return t('game.errorBaseWord');
    case 'INVALID_LETTERS':
      return t('game.errorInvalidLetters');
    case 'ALREADY_SUBMITTED':
      return t('game.errorAlreadySubmitted');
    default:
      return t('game.errorUnknown');
  }
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundSecondary,
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
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  playerName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  playRules: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  feedbackSlot: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackToast: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  footerButton: {
    flex: 1,
  },
  footerButtonSolo: {
    flex: 1,
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
  standingName: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
  },
  standingMeta: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
