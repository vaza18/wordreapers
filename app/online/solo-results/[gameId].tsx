import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { CenterDialogModal } from '@/components/CenterDialogModal';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useRoundPlayableLexicon } from '@/hooks/useRoundPlayableLexicon';
import { RoundResultsView } from '@/components/RoundResultsView';
import { useTheme } from '@/hooks/useTheme';
import { formatResultsHeadline } from '@/lib/game/results-headline';
import { createSoloResultsDirectory } from '@/lib/game/results-directory';
import { buildGlobalResultWords, buildPlayerResultRankGroups } from '@/lib/game/results-view';
import { computeRoundDurationSeconds } from '@/lib/game/round-duration';
import { useTrainingMilestone } from '@/hooks/useTrainingMilestone';
import { ukWordForm } from '@/lib/i18n/uk-plural';
import {
  meetsTrainingMilestone,
  markTrainingRoundCompleted,
  trainingWordsRequired,
} from '@/lib/onboarding/training-milestone';
import {
  buildSoloFinishedArchiveWords,
  buildSoloFinishedSession,
  saveSoloFinishedRoundArchive,
} from '@/lib/online/solo-round-archive';
import { removeLocalRoomDraft } from '@/lib/online/local-room-draft';
import { organizerSoloStandings, useOrganizerSoloStore } from '@/store/organizer-solo-store';
import { usePlayerStatsStore } from '@/store/player-stats-store';
import { useProfileStore } from '@/store/profile-store';

/**
 * Local results after an organizer solo round (no Firebase).
 */
export default function OrganizerSoloResultsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { gameId: rawGameId } = useLocalSearchParams<{ gameId: string }>();
  const gameId = rawGameId ?? '';
  const statsRecordedRef = useRef(false);
  const archiveRecordedRef = useRef(false);
  const milestoneMarkedRef = useRef(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [showRetryModal, setShowRetryModal] = useState(false);
  const {
    hydrated: milestoneHydrated,
    hasCompletedTrainingRound,
    refresh: refreshTrainingMilestone,
  } = useTrainingMilestone();

  const setup = useOrganizerSoloStore((state) => state.setup);
  const status = useOrganizerSoloStore((state) => state.status);
  const words = useOrganizerSoloStore((state) => state.words);
  const uniqueBonusEnabled = useOrganizerSoloStore((state) => state.uniqueBonusEnabled);
  const finishedAt = useOrganizerSoloStore((state) => state.endsAt);
  const roundPlayedSeconds = useOrganizerSoloStore((state) => state.roundPlayedSeconds);
  const clear = useOrganizerSoloStore((state) => state.clear);
  const profileName = useProfileStore((state) => state.name);
  const avatarColorIndex = useProfileStore((state) => state.avatarColorIndex);
  const profileGender = useProfileStore((state) => state.gender);

  useEffect(() => {
    if (status === 'playing') {
      router.replace({ pathname: '/online/solo/[gameId]', params: { gameId } });
      return;
    }
    if (status === 'idle') {
      router.replace('/');
    }
  }, [gameId, status]);

  useEffect(() => {
    if (status !== 'finished' || !setup || !gameId) {
      return;
    }
    const state = useOrganizerSoloStore.getState();
    const profile = useProfileStore.getState();

    if (!statsRecordedRef.current) {
      statsRecordedRef.current = true;
      const standings = organizerSoloStandings(state);
      const wordsCollected = standings[0]?.wordCount ?? 0;
      void usePlayerStatsStore.getState().recordOnlineRound(false, wordsCollected);
    }

    if (!archiveRecordedRef.current) {
      archiveRecordedRef.current = true;
      void saveSoloFinishedRoundArchive(
        gameId,
        setup,
        state.words,
        state.uniqueBonusEnabled,
        {
          name: profile.name,
          gender: profile.gender,
          avatarColorIndex: profile.avatarColorIndex,
        },
        state.endsAt ?? undefined,
        state.roundPlayedSeconds ?? undefined,
      ).catch((error) => {
        archiveRecordedRef.current = false;
        if (__DEV__) {
          console.warn('saveSoloFinishedRoundArchive', error);
        }
      });
    }
  }, [gameId, setup, status]);

  const viewData = useMemo(() => {
    if (!setup) {
      return null;
    }
    const wordsMap = new Map<string, readonly string[]>([['solo', words.map((w) => w.normalized)]]);
    const displaysMap = new Map<string, readonly string[]>([['solo', words.map((w) => w.display)]]);
    const directory = createSoloResultsDirectory(
      profileName.trim() || t('profile.namePlaceholder'),
      avatarColorIndex,
      profileGender,
    );
    const standings = organizerSoloStandings(useOrganizerSoloStore.getState());
    const soloProfile = {
      name: profileName,
      gender: profileGender,
      avatarColorIndex,
    };
    const soloSession = buildSoloFinishedSession(
      setup,
      words,
      uniqueBonusEnabled,
      soloProfile,
      finishedAt ?? undefined,
      roundPlayedSeconds ?? undefined,
    );
    const soloWordsArchive = buildSoloFinishedArchiveWords(words);
    const roundDurationSeconds = computeRoundDurationSeconds(soloSession, soloWordsArchive);
    const globalWords = buildGlobalResultWords({
      wordsByPlayer: wordsMap,
      displaysByPlayer: displaysMap,
      directory,
      uniqueBonusEnabled: false,
    });
    const playerRankGroups = buildPlayerResultRankGroups({
      wordsByPlayer: wordsMap,
      displaysByPlayer: displaysMap,
      directory,
      uniqueBonusEnabled: false,
      standings,
      roundDurationSeconds,
    });
    const headline = formatResultsHeadline(t, directory, standings, false);
    return {
      headline,
      globalWords,
      playerRankGroups,
      totalDistinctWords: globalWords.length,
      roundDurationSeconds,
    };
  }, [
    avatarColorIndex,
    finishedAt,
    profileGender,
    profileName,
    roundPlayedSeconds,
    setup,
    t,
    uniqueBonusEnabled,
    words,
  ]);

  const { lexicon: roundLexicon, loading: lexiconLoading } = useRoundPlayableLexicon({
    baseWord: setup?.baseWord ?? '',
    allowProperNouns: setup?.allowProperNouns ?? false,
    allowSlang: setup?.allowSlang ?? false,
    enabled: Boolean(setup?.baseWord),
  });

  const soloRoundMeetsMilestone = useMemo(() => {
    const lexiconMaxCount = roundLexicon?.maxCount ?? 0;
    if (lexiconMaxCount <= 0) {
      return false;
    }
    return meetsTrainingMilestone(words.length, lexiconMaxCount);
  }, [roundLexicon?.maxCount, words]);

  useEffect(() => {
    if (
      status !== 'finished' ||
      !setup ||
      lexiconLoading ||
      !milestoneHydrated ||
      milestoneMarkedRef.current
    ) {
      return;
    }
    const lexiconMaxCount = roundLexicon?.maxCount ?? 0;
    if (lexiconMaxCount <= 0) {
      return;
    }
    milestoneMarkedRef.current = true;
    // Once multiplayer is unlocked (gate passed at least once), neither the
    // unlock nor the retry modal should ever appear again.
    if (hasCompletedTrainingRound) {
      return;
    }
    if (soloRoundMeetsMilestone) {
      // First time crossing the 5% gate — unlock multiplayer and celebrate.
      void markTrainingRoundCompleted().then(() => {
        refreshTrainingMilestone();
        setShowUnlockModal(true);
      });
    } else {
      // Multiplayer still locked and this round missed the gate — explain what to do.
      setShowRetryModal(true);
    }
  }, [
    hasCompletedTrainingRound,
    lexiconLoading,
    milestoneHydrated,
    refreshTrainingMilestone,
    roundLexicon?.maxCount,
    setup,
    soloRoundMeetsMilestone,
    status,
  ]);

  const handleRetryTraining = () => {
    if (!setup) {
      return;
    }
    setShowRetryModal(false);
    const store = useOrganizerSoloStore.getState();
    store.initFromSetup(gameId, setup);
    store.startRound();
    router.replace({ pathname: '/online/solo/[gameId]', params: { gameId } });
  };

  const goHome = () => {
    clear();
    removeLocalRoomDraft(gameId);
    router.replace('/');
  };

  if (!setup || !viewData) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.backgroundSecondary,
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('game.resultsTitle') }} />
      <CenterDialogModal
        visible={showUnlockModal}
        title={t('training.unlockedTitle')}
        body={t('training.unlockedBody')}
        primaryLabel={t('training.unlockedCtaJoin')}
        onPrimary={() => {
          setShowUnlockModal(false);
          router.replace('/online/join');
        }}
        secondaryLabel={t('training.unlockedCtaHome')}
        onSecondary={() => {
          setShowUnlockModal(false);
          goHome();
        }}
        tertiaryLabel={t('training.unlockedCtaResults')}
        onTertiary={() => {
          setShowUnlockModal(false);
        }}
      />
      <CenterDialogModal
        visible={showRetryModal}
        title={t('training.retryTitle')}
        body={t('training.retryBody', {
          found: words.length,
          foundForm: ukWordForm(words.length),
          required: trainingWordsRequired(roundLexicon?.maxCount ?? 0),
          requiredForm: ukWordForm(trainingWordsRequired(roundLexicon?.maxCount ?? 0)),
        })}
        primaryLabel={t('training.retryCtaAgain')}
        onPrimary={handleRetryTraining}
        secondaryLabel={t('training.unlockedCtaResults')}
        onSecondary={() => {
          setShowRetryModal(false);
        }}
        tertiaryLabel={t('training.unlockedCtaHome')}
        onTertiary={() => {
          setShowRetryModal(false);
          goHome();
        }}
      />
      <RoundResultsView
        headline={viewData.headline}
        baseWordDisplay={setup.baseWordDisplay}
        totalDistinctWords={viewData.totalDistinctWords}
        maxPlayableWords={roundLexicon?.maxCount ?? null}
        roundLexicon={roundLexicon}
        lexiconLoading={lexiconLoading}
        globalWords={viewData.globalWords}
        playerRankGroups={viewData.playerRankGroups}
        highlightPlayerId="solo"
        defaultExpandedPlayerId="solo"
        winnerOverride={showUnlockModal}
        showScores={false}
        showWordAuthors={false}
        roundDurationSeconds={viewData.roundDurationSeconds}
        footer={<PrimaryButton label={t('nav.home')} onPress={goHome} />}
      />
    </>
  );
}
