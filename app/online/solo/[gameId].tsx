import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRoundPlayableLexicon } from '@/hooks/useRoundPlayableLexicon';
import {
  hasWordInSortedList,
  loadBundledDictionary,
  loadBundledSupplements,
} from '@/services/dictionary-service';
import { AddTimeModal } from '@/components/AddTimeModal';
import { GameMenuModal } from '@/components/GameMenuModal';
import { GamePlayStatusBar } from '@/components/GamePlayStatusBar';
import { GameTimeUpModal } from '@/components/GameTimeUpModal';
import { HowToPlayDialog } from '@/components/HowToPlayDialog';
import { OnlinePlayComposePanel } from '@/components/online/OnlinePlayComposePanel';
import { OnlinePlayWordListSection } from '@/components/online/OnlinePlayWordListSection';
import { PauseRoundModal } from '@/components/PauseRoundModal';
import { spacing, type ThemeColors } from '@/constants/theme';
import { modalOverlayBackground } from '@/lib/ui/modal-chrome';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useAutoPauseOnAppBackground } from '@/hooks/useAutoPauseOnAppBackground';
import { useTrainingMilestone } from '@/hooks/useTrainingMilestone';
import { useTimerAlerts } from '@/hooks/useTimerAlerts';
import { useRoundTimeUpModal } from '@/hooks/useRoundTimeUpModal';
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
import { formatTimerMs } from '@/lib/game/timer-label';
import { gameSessionSettingsFromSetup } from '@/lib/firebase/session-settings';
import type { GameSession } from '@/lib/firebase/types';
import { computePlayerScore } from '@/lib/game/scoring';
import { getLocalRoomDraft } from '@/lib/online/local-room-draft';
import { publishPlayingSoloForDraft } from '@/lib/online/publish-room';
import { useFirebaseStore } from '@/store/firebase-store';
import {
  organizerSoloSnapshotForPublish,
  useOrganizerSoloStore,
} from '@/store/organizer-solo-store';
import { useProfileStore } from '@/store/profile-store';
import { useSettingsStore } from '@/store/settings-store';

const VALIDATION_DEBOUNCE_MS = 1000;
const FEEDBACK_DISMISS_MS = 2200;

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
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastValidatedDraft = useRef('');
  const timeUpHandledRef = useRef(false);

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
    void Promise.all([loadBundledDictionary(), loadBundledSupplements()]).then(
      ([dict, supplements]) => {
        setDictionary(dict);
        setProperNouns(supplements.properNouns);
        setSlang(supplements.slang);
        setSupplementsReady(true);
      },
    );
    return () => {
      void Promise.all([loadBundledDictionary(), loadBundledSupplements()]);
    };
  }, []);

  const { lexicon: roundLexicon } = useRoundPlayableLexicon({
    baseWord: setup?.baseWord ?? '',
    allowProperNouns: setup?.allowProperNouns ?? false,
    allowSlang: setup?.allowSlang ?? false,
    releaseDictionaryAfterBuild: true,
    enabled: Boolean(setup?.baseWord && status === 'playing'),
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (status === 'playing' && endsAt !== null && now >= endsAt && !timeUpHandledRef.current) {
      timeUpHandledRef.current = true;
      finishRound();
    }
  }, [endsAt, finishRound, now, status]);

  const { timeUpModalVisible } = useRoundTimeUpModal(status === 'finished');

  useEffect(() => {
    if (!feedback) {
      return;
    }
    const timer = setTimeout(() => {
      setFeedback(null);
      setFeedbackVariant('default');
    }, FEEDBACK_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  const baseWordDisplay = setup?.baseWordDisplay ?? '';
  const letterKeys = useMemo(() => buildLetterKeys(baseWordDisplay), [baseWordDisplay]);
  const usedKeyIndices = useMemo(() => new Set(draftKeyIndices), [draftKeyIndices]);
  const scoredWords = getScoredWords();
  const displays = words.map((word) => word.display);
  const playerScore = computePlayerScore(scoredWords);
  const isPaused = status === 'paused';
  const remainingMs = getRemainingMs(now);
  const remainingLabel = formatTimerMs(remainingMs);
  const timerUrgent = remainingMs > 0 && remainingMs <= 60_000;

  useTimerAlerts(remainingMs, isPaused, timerAlertMode, status === 'playing');
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
        frozenRemainingMs: remainingMs,
        frozenAt: now,
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
    remainingMs,
    now,
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
            (setup.allowProperNouns && hasWordInSortedList(properNouns, word)) ||
            (setup.allowSlang && hasWordInSortedList(slang, word)),
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
            <GamePlayStatusBar
              timerLabel={remainingLabel}
              timerUrgent={timerUrgent}
              rank={1}
              showRank={false}
              showScore={false}
              wordCount={scoredWords.length}
              maxWordCount={roundLexicon?.maxCount ?? null}
              score={playerScore}
              wordsShort={t('game.wordsShort')}
              pointsShort={t('game.pointsShort')}
              menuLabel={t('game.menu')}
              onMenuPress={() => {
                setShowGameMenu(true);
              }}
              onAddTimePress={() => {
                setShowAddTimeModal(true);
              }}
              addTimeAccessibilityLabel={t('game.addTimeTitle')}
              style={{ marginHorizontal: -spacing.md }}
            />

            <View style={styles.playerHeader}>
              <Text style={styles.playerName} numberOfLines={1}>
                {myName}
              </Text>
              {playRulesLabel ? (
                <Text style={styles.playRules} numberOfLines={2}>
                  {playRulesLabel}
                </Text>
              ) : null}
            </View>

            <View style={styles.wordListSection}>
              <OnlinePlayWordListSection
                entries={scoredWords}
                displays={displays}
                draftPrefix={draft}
                scrollToNormalized={scrollRequest?.normalized ?? null}
                scrollToRequestId={scrollRequest?.id}
                feedback={feedback}
                feedbackVariant={feedbackVariant}
                backgroundSyncing={false}
                showScoreBadges={false}
                showOverlapPeers={false}
              />
              {publishError ? <Text style={styles.publishError}>{publishError}</Text> : null}
            </View>

            <OnlinePlayComposePanel
              draft={draft}
              draftKeyIndices={draftKeyIndices}
              letterKeys={letterKeys}
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
          serverNow={now}
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
      />

      <GameTimeUpModal
        visible={timeUpModalVisible}
        onViewResults={() => {
          router.replace({ pathname: '/online/solo-results/[gameId]', params: { gameId } });
        }}
      />

      <AddTimeModal
        visible={showAddTimeModal}
        remainingMs={remainingMs}
        requiresConsensus={false}
        onClose={() => {
          setShowAddTimeModal(false);
        }}
        onSelect={(minutes) => {
          addTime(minutes);
        }}
      />

      <HowToPlayDialog enabled={status === 'playing'} />

      {publishing ? (
        <View style={styles.publishingOverlay}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : null}
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
    wordListSection: {
      flex: 1,
      minHeight: 0,
    },
    publishError: {
      fontSize: 13,
      color: '#E24B4A',
      textAlign: 'center',
    },
    publishingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: modalOverlayBackground(colors),
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
