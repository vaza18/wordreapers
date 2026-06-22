import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  hasWordInSortedList,
  loadBundledDictionary,
  loadBundledSupplements,
} from '@/services/dictionary-service';
import { AddTimeModal } from '@/components/AddTimeModal';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { GameMenuModal } from '@/components/GameMenuModal';
import { GamePlayStatusBar } from '@/components/GamePlayStatusBar';
import { GameTimeUpModal } from '@/components/GameTimeUpModal';
import { LetterKeyboard } from '@/components/LetterKeyboard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { WordList } from '@/components/WordList';
import { colors, radii, spacing } from '@/constants/theme';
import { useAutoPauseOnAppBackground } from '@/hooks/useAutoPauseOnAppBackground';
import { useTimerAlerts } from '@/hooks/useTimerAlerts';
import { useRoundTimeUpModal } from '@/hooks/useRoundTimeUpModal';
import { DictionaryIndex } from '@/lib/dictionary/dictionary-index';
import { toDisplayUpper } from '@/lib/dictionary/normalize';
import { playWordAcceptedFeedback } from '@/lib/feedback/game-feedback';
import { ensureFirebaseReady } from '@/lib/firebase/ensure-firebase-ready';
import { joinErrorMessage } from '@/lib/firebase/join-error-message';
import { buildLetterKeys, computeLetterKeySize } from '@/lib/game/letter-keyboard';
import { letterKeyFontSizeForKeySize } from '@/lib/game/letter-key-style';
import { acceptWord, type PlayWordErrorCode } from '@/lib/game/play-word';
import { formatPlayRulesLabel } from '@/lib/online/play-rules-label';
import { gameSessionSettingsFromSetup } from '@/lib/firebase/session-settings';
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

/**
 * Organizer solo round — local only until invite publishes to Firebase.
 */
export default function OrganizerSoloPlayScreen() {
  const { t } = useTranslation();
  const { gameId: rawGameId } = useLocalSearchParams<{ gameId: string }>();
  const gameId = rawGameId ?? '';
  const { width: screenWidth } = useWindowDimensions();
  const composeKeySize = computeLetterKeySize(screenWidth);
  const composeKeyFontSize = letterKeyFontSizeForKeySize(composeKeySize);
  const wordAcceptedFeedback = useSettingsStore((state) => state.wordAcceptedFeedback);
  const timerAlertMode = useSettingsStore((state) => state.timerAlertMode);
  const myName = useProfileStore((state) => state.name) || t('profile.namePlaceholder');

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
  }, []);

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
    const timer = setTimeout(() => setFeedback(null), FEEDBACK_DISMISS_MS);
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
  const remainingLabel = formatTimer(remainingMs);
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
        options: { minWordLength: 2 },
        deps: {
          hasInDictionary: (word) =>
            dictionary.hasWord(word) ||
            (setup.allowProperNouns && hasWordInSortedList(properNouns, word)) ||
            (setup.allowSlang && hasWordInSortedList(slang, word)),
        },
        lookupDisplayUpper: (word) => dictionary.lookupDisplayUpper(word) ?? toDisplayUpper(word),
      });

      if (!result.accepted || !result.entry) {
        if (result.error === 'NOT_IN_DICTIONARY') {
          return;
        }
        const message = errorMessage(t, result.error);
        if (message) {
          setFeedback(message);
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
      playWordAcceptedFeedback(wordAcceptedFeedback);
    },
    [
      appendWord,
      dictionary,
      uniqueBonusEnabled,
      properNouns,
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
    if (!setup || !gameId || publishing) {
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
            <FeedbackPressable
              accessibilityRole="button"
              accessibilityLabel={t('game.addTimeTitle')}
              onPress={() => {
                setShowAddTimeModal(true);
              }}
            >
              <GamePlayStatusBar
                timerLabel={remainingLabel}
                timerUrgent={timerUrgent}
                rank={1}
                showRank={false}
                showScore={false}
                wordCount={scoredWords.length}
                score={playerScore}
                wordsShort={t('game.wordsShort')}
                pointsShort={t('game.pointsShort')}
                style={{ marginHorizontal: -spacing.md }}
              />
            </FeedbackPressable>

            <View style={styles.footer}>
              <PrimaryButton
                label={t('game.menu')}
                variant="secondary"
                style={styles.footerButtonSolo}
                onPress={() => {
                  setShowGameMenu(true);
                }}
              />
            </View>

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
              <WordList
                entries={scoredWords}
                displays={displays}
                draftPrefix={draft}
                scrollToNormalized={scrollRequest?.normalized ?? null}
                scrollToRequestId={scrollRequest?.id}
                showScoreBadges={false}
                showOverlapPeers={false}
              />
              <View style={styles.feedbackSlot}>
                {feedback ? <Text style={styles.feedbackToast}>{feedback}</Text> : null}
                {publishError ? <Text style={styles.publishError}>{publishError}</Text> : null}
              </View>
            </View>

            <View style={styles.composeRow}>
              <FeedbackPressable
                accessibilityRole="button"
                onPress={clearDraft}
                style={[
                  styles.composeKey,
                  { width: composeKeySize, height: composeKeySize },
                  styles.composeKeyDanger,
                ]}
              >
                <Text style={[styles.composeKeyLabel, { fontSize: composeKeyFontSize }]}>✕</Text>
              </FeedbackPressable>
              <View style={[styles.draftBox, { height: composeKeySize }]}>
                <Text style={styles.draftText}>{toDisplayUpper(draft) || ' '}</Text>
              </View>
              <FeedbackPressable
                accessibilityRole="button"
                onPress={backspaceDraft}
                style={[
                  styles.composeKey,
                  { width: composeKeySize, height: composeKeySize },
                  styles.composeKeyAlert,
                ]}
              >
                <Text style={[styles.composeKeyLabel, { fontSize: composeKeyFontSize }]}>⌫</Text>
              </FeedbackPressable>
            </View>

            <LetterKeyboard
              keys={letterKeys}
              usedKeyIndices={usedKeyIndices}
              onPressKey={pressKey}
            />
          </>
        ) : (
          <View style={styles.pauseOverlay}>
            <Text style={styles.pauseTitle}>{t('game.pauseTitle')}</Text>
            <Text style={styles.pauseTimer}>
              {t('game.pauseFrozenTimer', { time: formatTimer(remainingMs) })}
            </Text>
            <PrimaryButton label={t('game.pauseResumeNow')} onPress={resumeRound} />
            <PrimaryButton
              label={t('game.menu')}
              variant="secondary"
              onPress={() => {
                setShowGameMenu(true);
              }}
            />
          </View>
        )}
      </SafeAreaView>

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
        showInvite
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

      {publishing ? (
        <View style={styles.publishingOverlay}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : null}
    </>
  );
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
  composeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  composeKey: {
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeKeyDanger: {
    backgroundColor: colors.dangerLight,
  },
  composeKeyAlert: {
    backgroundColor: colors.alert,
  },
  composeKeyLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  draftBox: {
    flex: 1,
    backgroundColor: '#FAEEDA',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  draftText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1,
    color: '#412402',
  },
  wordListSection: {
    flex: 1,
    minHeight: 0,
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
  publishError: {
    fontSize: 13,
    color: '#E24B4A',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  footerButtonSolo: {
    flex: 1,
  },
  pauseOverlay: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  pauseTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  pauseTimer: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  publishingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
