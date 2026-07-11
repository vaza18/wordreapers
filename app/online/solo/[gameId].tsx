import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRoundPlayableLexicon } from '@/hooks/useRoundPlayableLexicon';
import { getCachedRoundPlayableLexicon } from '@/lib/dictionary/round-playable-lexicon-cache';
import {
  hasWordInSortedList,
  loadBundledDictionary,
  loadBundledSupplements,
  loadBundledWhitelists,
} from '@/services/dictionary-service';
import { AddTimeModal } from '@/components/AddTimeModal';
import { GameMenuModal } from '@/components/GameMenuModal';
import { GameTimeUpModal } from '@/components/GameTimeUpModal';
import { HowToPlayDialog } from '@/components/HowToPlayDialog';
import { OnlinePlayActiveBody } from '@/components/online/OnlinePlayActiveBody';
import { OrganizerSoloTimerHeader } from '@/components/online/OrganizerSoloTimerHeader';
import { PlayStatsExplainModal } from '@/components/online/PlayStatsExplainModal';
import { TrainingProgressBar } from '@/components/online/TrainingProgressBar';
import { PauseRoundModal } from '@/components/PauseRoundModal';
import { PlaySessionToastStack } from '@/components/PlaySessionToast';
import { SOLO_SUCCESS_CONFETTI_LEVELS } from '@/constants/solo-round-success-constants';
import { spacing, type ThemeColors } from '@/constants/theme';
import { modalOverlayBackground } from '@/lib/ui/modal-chrome';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useAutoPauseOnAppBackground } from '@/hooks/useAutoPauseOnAppBackground';
import { usePlayWordFeedbackDismiss } from '@/hooks/usePlayWordFeedback';
import { useToastQueue } from '@/hooks/useToastQueue';
import { useTrainingFirstWordHint } from '@/hooks/useTrainingFirstWordHint';
import { useTrainingMilestone } from '@/hooks/useTrainingMilestone';
import { resolveRoundSuccessLevel } from '@/lib/game/solo-round-success';
import { formatSoloSuccessLevelUpToast } from '@/lib/game/solo-round-success-i18n';
import { useVictoryConfettiStore } from '@/store/victory-confetti-store';
import { DictionaryIndex } from '@/lib/dictionary/dictionary-index';
import { toDisplayUpper } from '@/lib/dictionary/normalize';
import { playWordAcceptedFeedback } from '@/lib/feedback/game-feedback';
import { ensureFirebaseReady } from '@/lib/firebase/ensure-firebase-ready';
import { joinErrorMessage } from '@/lib/firebase/join-error-message';
import { buildLetterKeys } from '@/lib/game/letter-keyboard';
import { acceptWord } from '@/lib/game/play-word';
import {
  playWordErrorMessage,
  playWordFeedbackVariant,
  type PlayWordFeedbackVariant,
} from '@/lib/game/play-word-feedback';
import { formatPlayRulesLabel } from '@/lib/online/play-rules-label';
import { gameSessionSettingsFromSetup } from '@/lib/firebase/session-settings';
import type { GameSession } from '@/lib/firebase/types';
import { computePlayerScore } from '@/lib/game/scoring';
import { getLocalRoomDraft } from '@/lib/online/local-room-draft';
import { abandonOrganizerWaitingRoomForDraft } from '@/lib/online/abandon-tracked-waiting-room';
import { publishPlayingSoloForDraft } from '@/lib/online/publish-room';
import { useFirebaseStore } from '@/store/firebase-store';
import {
  organizerSoloSnapshotForPublish,
  useOrganizerSoloStore,
} from '@/store/organizer-solo-store';
import { useProfileStore } from '@/store/profile-store';
import { useSettingsStore } from '@/store/settings-store';
import { VALIDATION_DEBOUNCE_MS } from '@/constants/game-timing';

/**
 * Organizer solo round — local only until invite publishes to Firebase.
 */
export default function OrganizerSoloPlayScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { gameId: rawGameId } = useLocalSearchParams<{ gameId: string }>();
  const gameId = rawGameId ?? '';
  const wordAcceptedFeedback = useSettingsStore((state) => state.wordAcceptedFeedback);
  const timerAlertMode = useSettingsStore((state) => state.timerAlertMode);
  const myName = useProfileStore((state) => state.name) || t('profile.namePlaceholder');
  const viewerGender = useProfileStore((state) => state.gender);
  const myUid = useFirebaseStore((state) => state.uid) ?? 'solo';
  const { hydrated: trainingHydrated, hasCompletedTrainingRound } = useTrainingMilestone();
  const canInviteOthers = trainingHydrated && hasCompletedTrainingRound;
  const isFocused = useIsFocused();
  const { toasts, enqueueToasts } = useToastQueue();
  const celebrate = useVictoryConfettiStore((state) => state.celebrate);
  const prevSuccessWordCountRef = useRef(0);

  const setup = useOrganizerSoloStore((state) => state.setup);
  const status = useOrganizerSoloStore((state) => state.status);
  const endsAt = useOrganizerSoloStore((state) => state.endsAt);
  const words = useOrganizerSoloStore((state) => state.words);
  const uniqueBonusEnabled = useOrganizerSoloStore((state) => state.uniqueBonusEnabled);
  const appendWord = useOrganizerSoloStore((state) => state.appendWord);
  const finishRound = useOrganizerSoloStore((state) => state.finishRound);
  const pauseRound = useOrganizerSoloStore((state) => state.pauseRound);
  const resumeRound = useOrganizerSoloStore((state) => state.resumeRound);
  const addTime = useOrganizerSoloStore((state) => state.addTime);
  const getScoredWords = useOrganizerSoloStore((state) => state.getScoredWords);
  const getRemainingMs = useOrganizerSoloStore((state) => state.getRemainingMs);

  const [dictionary, setDictionary] = useState<DictionaryIndex | null>(null);
  const [properNouns, setProperNouns] = useState<string[]>([]);
  const [slang, setSlang] = useState<string[]>([]);
  const [whitelistGeneral, setWhitelistGeneral] = useState<string[]>([]);
  const [whitelistProper, setWhitelistProper] = useState<string[]>([]);
  const [whitelistSlang, setWhitelistSlang] = useState<string[]>([]);
  const [supplementsReady, setSupplementsReady] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftKeyIndices, setDraftKeyIndices] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackVariant, setFeedbackVariant] = useState<PlayWordFeedbackVariant>('default');
  const [scrollRequest, setScrollRequest] = useState<{ normalized: string; id: number } | null>(
    null,
  );
  const [showGameMenu, setShowGameMenu] = useState(false);
  const [showAddTimeModal, setShowAddTimeModal] = useState(false);
  const [showStatsExplain, setShowStatsExplain] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastValidatedDraft = useRef('');

  useEffect(() => {
    if (!gameId) {
      router.replace('/');
      return;
    }
    if (status === 'idle' && !setup) {
      router.replace('/');
    }
  }, [gameId, setup, status]);

  useEffect(() => {
    if (!gameId) {
      return;
    }
    void abandonOrganizerWaitingRoomForDraft(gameId).catch((error) => {
      if (__DEV__) {
        console.warn('solo abandon waiting room for draft', error);
      }
    });
  }, [gameId]);

  useEffect(() => {
    void Promise.all([
      loadBundledDictionary(),
      loadBundledSupplements(),
      loadBundledWhitelists(),
    ]).then(([dict, supplements, whitelists]) => {
      setDictionary(dict);
      setProperNouns(supplements.properNouns);
      setSlang(supplements.slang);
      setWhitelistGeneral(whitelists.general);
      setWhitelistProper(whitelists.properNouns);
      setWhitelistSlang(whitelists.slang);
      setSupplementsReady(true);
    });
    return () => {
      void Promise.all([
        loadBundledDictionary(),
        loadBundledSupplements(),
        loadBundledWhitelists(),
      ]);
    };
  }, []);

  const { lexicon: roundLexicon } = useRoundPlayableLexicon({
    baseWord: setup?.baseWord ?? '',
    allowProperNouns: setup?.allowProperNouns ?? false,
    allowSlang: setup?.allowSlang ?? false,
    releaseDictionaryAfterBuild: true,
    enabled: Boolean(setup?.baseWord && (status === 'playing' || status === 'finished')),
  });

  const timeUpModalVisible = status === 'finished' && isFocused && !showAddTimeModal;

  const clearFeedback = useCallback(() => {
    setFeedback(null);
    setFeedbackVariant('default');
  }, []);

  usePlayWordFeedbackDismiss(feedback, feedbackVariant, clearFeedback);

  const showFirstWordHint = useCallback((message: string) => {
    setFeedback(message);
    setFeedbackVariant('default');
  }, []);

  const baseWordDisplay = setup?.baseWordDisplay ?? '';
  const letterKeys = useMemo(() => buildLetterKeys(baseWordDisplay), [baseWordDisplay]);
  const usedKeyIndices = useMemo(() => new Set(draftKeyIndices), [draftKeyIndices]);
  const scoredWords = getScoredWords();
  const displays = words.map((word) => word.display);
  const cachedLexiconMaxCount = useMemo(() => {
    if (!setup?.baseWord) {
      return null;
    }
    return (
      getCachedRoundPlayableLexicon(
        setup.baseWord,
        setup.allowProperNouns ?? false,
        setup.allowSlang ?? false,
      )?.maxCount ?? null
    );
  }, [setup]);
  const maxWordCountLive = roundLexicon?.maxCount ?? cachedLexiconMaxCount;
  const maxWordCountRef = useRef<number | null>(null);
  if (maxWordCountLive != null) {
    maxWordCountRef.current = maxWordCountLive;
  }
  const maxWordCount = maxWordCountLive ?? maxWordCountRef.current;
  const playerScore = computePlayerScore(scoredWords);
  const isPaused = status === 'paused';
  const addTimeRemainingMs = getRemainingMs(Date.now());

  const showSuccessBar =
    status === 'playing' && !isPaused && roundLexicon != null && roundLexicon.maxCount > 0;
  const showUnlockHint = trainingHydrated && !hasCompletedTrainingRound;

  useEffect(() => {
    if (!showSuccessBar || !roundLexicon) {
      return;
    }
    const count = scoredWords.length;
    const prevCount = prevSuccessWordCountRef.current;
    prevSuccessWordCountRef.current = count;
    if (count <= prevCount) {
      return;
    }
    const levelId = resolveRoundSuccessLevel(count, roundLexicon.maxCount);
    const prevLevelId = resolveRoundSuccessLevel(prevCount, roundLexicon.maxCount);
    if (levelId === 'none' || levelId === prevLevelId) {
      return;
    }
    const message = formatSoloSuccessLevelUpToast(t, levelId);
    if (message) {
      enqueueToasts([{ message, variant: 'success' }]);
    }
    if (SOLO_SUCCESS_CONFETTI_LEVELS.has(levelId)) {
      celebrate();
    }
  }, [celebrate, enqueueToasts, roundLexicon, scoredWords.length, showSuccessBar, t]);

  useTrainingFirstWordHint({
    enabled: showUnlockHint && showSuccessBar && scoredWords.length === 0,
    wordCount: scoredWords.length,
    draftLength: draft.length,
    sortedWords: roundLexicon?.sortedWords,
    displays: roundLexicon?.displays,
    t,
    onHint: showFirstWordHint,
    onClearHint: clearFeedback,
  });

  useAutoPauseOnAppBackground(status === 'playing', pauseRound);
  const playRulesLabel = formatPlayRulesLabel(
    t,
    setup
      ? gameSessionSettingsFromSetup(
          setup.durationMinutes,
          setup.uniqueBonusMode,
          setup.allowProperNouns,
          setup.allowSlang,
          1,
        )
      : null,
  );

  const pauseSession = useMemo((): GameSession | null => {
    if (!setup || !isPaused) {
      return null;
    }
    const frozenRemainingMs = getRemainingMs(Date.now());
    return {
      baseWord: setup.baseWord,
      status: 'playing',
      settings: gameSessionSettingsFromSetup(
        setup.durationMinutes,
        setup.uniqueBonusMode,
        setup.allowProperNouns,
        setup.allowSlang,
        1,
      ),
      timerEndsAt: null,
      organizerId: myUid,
      players: {
        [myUid]: {
          name: myName,
          gender: viewerGender,
          wordCount: scoredWords.length,
          score: playerScore,
          online: true,
        },
      },
      pauseState: {
        active: true,
        frozenRemainingMs,
        frozenAt: Date.now(),
      },
    };
  }, [
    setup,
    isPaused,
    myUid,
    myName,
    viewerGender,
    scoredWords.length,
    playerScore,
    getRemainingMs,
  ]);

  const pauseUiObscured = showGameMenu;

  const submitDraft = useCallback(
    (draftValue: string) => {
      if (!setup || !dictionary || !supplementsReady || draftValue.length === 0) {
        return;
      }
      if (draftValue === lastValidatedDraft.current) {
        return;
      }
      lastValidatedDraft.current = draftValue;

      const ownNormals = words.map((word) => word.normalized);
      const playerWordsMap = new Map<string, readonly string[]>([['solo', ownNormals]]);

      const result = acceptWord({
        input: draftValue,
        baseWord: setup.baseWord,
        playerId: 'solo',
        uniqueBonusEnabled,
        playerWords: playerWordsMap,
        options: {
          minWordLength: 2,
          roundLexicon: roundLexicon?.words,
        },
        deps: {
          hasInDictionary: (word) =>
            dictionary.hasWord(word) ||
            hasWordInSortedList(whitelistGeneral, word) ||
            (setup.allowProperNouns &&
              (hasWordInSortedList(properNouns, word) ||
                hasWordInSortedList(whitelistProper, word))) ||
            (setup.allowSlang &&
              (hasWordInSortedList(slang, word) || hasWordInSortedList(whitelistSlang, word))),
        },
        lookupDisplayUpper: (word) =>
          roundLexicon?.displays.get(word) ??
          dictionary.lookupDisplayUpper(word) ??
          toDisplayUpper(word),
      });

      if (!result.accepted || !result.entry) {
        const message = playWordErrorMessage(t, result.error);
        if (message) {
          setFeedback(message);
          setFeedbackVariant(playWordFeedbackVariant(false, result.error));
        }
        return;
      }

      appendWord({
        normalized: result.normalized,
        display: result.display ?? toDisplayUpper(result.normalized),
        kind: result.entry.kind,
        points: result.entry.points,
        badge: null,
        at: Date.now(),
      });
      setScrollRequest({ normalized: result.normalized, id: Date.now() });
      setDraft('');
      setDraftKeyIndices([]);
      lastValidatedDraft.current = '';
      setFeedback(t('game.wordAccepted'));
      setFeedbackVariant('success');
      playWordAcceptedFeedback(wordAcceptedFeedback);
    },
    [
      appendWord,
      dictionary,
      uniqueBonusEnabled,
      properNouns,
      roundLexicon,
      setup,
      slang,
      supplementsReady,
      t,
      whitelistGeneral,
      whitelistProper,
      whitelistSlang,
      wordAcceptedFeedback,
      words,
    ],
  );

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (draft.length === 0) {
      lastValidatedDraft.current = '';
      return;
    }
    debounceRef.current = setTimeout(() => submitDraft(draft), VALIDATION_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [draft, submitDraft]);

  const pressKey = (index: number) => {
    if (isPaused || usedKeyIndices.has(index)) {
      return;
    }
    const key = letterKeys[index];
    if (!key) {
      return;
    }
    setDraft((prev) => prev + key.value);
    setDraftKeyIndices((prev) => [...prev, index]);
    setFeedback(null);
  };

  const clearDraft = () => {
    setDraft('');
    setDraftKeyIndices([]);
    setFeedback(null);
    lastValidatedDraft.current = '';
  };

  const backspaceDraft = () => {
    setDraft((prev) => prev.slice(0, -1));
    setDraftKeyIndices((prev) => prev.slice(0, -1));
    setFeedback(null);
  };

  const handleInvite = async () => {
    if (!canInviteOthers || !setup || !gameId || publishing) {
      return;
    }
    const draftRoom = getLocalRoomDraft(gameId);
    if (!draftRoom) {
      setPublishError(t('online.errorRoomNotFound'));
      return;
    }
    setPublishing(true);
    setPublishError(null);
    setShowGameMenu(false);
    try {
      const firebase = await ensureFirebaseReady();
      if (firebase?.uid) {
        useFirebaseStore.getState().setConnection({
          status: firebase.status,
          uid: firebase.uid,
          errorMessage: firebase.errorMessage ?? null,
        });
      }
      const solo = organizerSoloSnapshotForPublish(useOrganizerSoloStore.getState());
      const finalId = await publishPlayingSoloForDraft(draftRoom, setup, solo);
      useOrganizerSoloStore.getState().markPublished();
      router.replace({
        pathname: '/online/play/[gameId]',
        params: { gameId: finalId, openInvite: '1' },
      });
      // Clear after navigation so idle solo state does not redirect home first.
      queueMicrotask(() => useOrganizerSoloStore.getState().clear());
    } catch (err) {
      setPublishError(joinErrorMessage(err, t));
    } finally {
      setPublishing(false);
    }
  };

  const exitAndFinish = () => {
    setShowGameMenu(false);
    finishRound();
  };

  if (!setup) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        {!isPaused ? (
          <>
            <OrganizerSoloTimerHeader
              endsAt={endsAt}
              isPaused={isPaused}
              roundActive={status === 'playing'}
              getRemainingMs={getRemainingMs}
              wordCount={scoredWords.length}
              maxWordCount={maxWordCount}
              score={playerScore}
              timerAlertMode={timerAlertMode}
              deferTimeUp={showAddTimeModal}
              onTimeUp={finishRound}
              onOpenGameMenu={() => {
                setShowGameMenu(true);
              }}
              onOpenAddTimeModal={() => {
                setShowAddTimeModal(true);
              }}
              onOpenStatsExplain={() => {
                setShowStatsExplain(true);
              }}
            />

            {showSuccessBar && roundLexicon ? (
              <TrainingProgressBar
                wordCount={scoredWords.length}
                lexiconMax={roundLexicon.maxCount}
                showUnlockHint={showUnlockHint}
              />
            ) : null}

            <OnlinePlayActiveBody
              myName={myName}
              playRulesLabel={playRulesLabel}
              hideEmptyPlayRules
              entries={scoredWords}
              displays={displays}
              draft={draft}
              draftKeyIndices={draftKeyIndices}
              letterKeys={letterKeys}
              scrollToNormalized={scrollRequest?.normalized ?? null}
              scrollToRequestId={scrollRequest?.id}
              feedback={feedback}
              feedbackVariant={feedbackVariant}
              backgroundSyncing={false}
              showScoreBadges={false}
              showOverlapPeers={false}
              publishError={publishError}
              onPressKey={pressKey}
              onClearDraft={clearDraft}
              onBackspaceDraft={backspaceDraft}
            />
          </>
        ) : null}
      </SafeAreaView>

      {isPaused && pauseSession ? (
        <PauseRoundModal
          visible={!pauseUiObscured}
          session={pauseSession}
          myUid={myUid}
          viewerGender={viewerGender}
          resumeVote={null}
          earlyFinishVote={null}
          hasOnlineOpponent={false}
          onProposeResume={resumeRound}
          onResumeYes={() => {}}
          onResumeNo={() => {}}
          onEarlyFinishYes={() => {}}
          onEarlyFinishNo={() => {}}
          onOpenMenu={() => {
            setShowGameMenu(true);
          }}
          onOpenSettings={() => {
            router.push('/settings');
          }}
        />
      ) : null}

      <GameMenuModal
        visible={showGameMenu}
        endGameLabel={t('game.menuEndEarly')}
        showEndGame={false}
        onClose={() => setShowGameMenu(false)}
        onPause={() => {
          setShowGameMenu(false);
          if (status === 'playing') {
            pauseRound();
          } else if (status === 'paused') {
            resumeRound();
          }
        }}
        onProposeEnd={() => {}}
        showPause={!isPaused}
        pauseLabel={t('game.menuPauseSolo')}
        showInvite={canInviteOthers}
        onInvite={() => {
          void handleInvite();
        }}
        onExit={exitAndFinish}
        onOpenSettings={() => {
          setShowGameMenu(false);
          router.push('/settings');
        }}
        onOpenHowToPlay={() => {
          setShowGameMenu(false);
          setShowHowToPlay(true);
        }}
      />

      <PlayStatsExplainModal
        visible={showStatsExplain}
        wordCount={scoredWords.length}
        maxWordCount={maxWordCount}
        showTrainingUnlockHint={trainingHydrated && !hasCompletedTrainingRound}
        onClose={() => {
          setShowStatsExplain(false);
        }}
      />

      <HowToPlayDialog
        enabled={status === 'playing' || showHowToPlay}
        forceOpen={showHowToPlay}
        onForceDismiss={() => setShowHowToPlay(false)}
      />

      <GameTimeUpModal
        visible={timeUpModalVisible}
        onViewResults={() => {
          router.replace({ pathname: '/online/solo-results/[gameId]', params: { gameId } });
        }}
      />

      <AddTimeModal
        visible={showAddTimeModal}
        remainingMs={addTimeRemainingMs}
        requiresConsensus={false}
        onClose={() => {
          setShowAddTimeModal(false);
          if (status === 'playing' && getRemainingMs(Date.now()) <= 0) {
            finishRound();
          }
        }}
        onSelect={(minutes) => {
          addTime(minutes);
        }}
      />

      {publishing ? (
        <View style={styles.publishingOverlay}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : null}

      <PlaySessionToastStack toasts={toasts} />
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
    container: {
      flex: 1,
      position: 'relative',
      backgroundColor: colors.backgroundSecondary,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      paddingTop: spacing.xs,
      gap: spacing.sm,
    },
    publishingOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: modalOverlayBackground(colors),
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
