import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { RoundResultsView } from '@/components/RoundResultsView';
import { StackHeaderTitle } from '@/components/StackHeaderTitle';
import { type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useOnlineViewerUid } from '@/hooks/useOnlineViewerUid';
import { isViewerWinner } from '@/lib/game/is-viewer-winner';
import { resolveRoundSuccessLevel } from '@/lib/game/solo-round-success';
import { formatSoloSuccessHistoryHeadline } from '@/lib/game/solo-round-success-i18n';
import type { GameSession } from '@/lib/firebase/types';
import { stackHeaderWithBackAndSettings } from '@/lib/navigation/stack-header-options';
import { loadFrozenFinishedRoundFromArchive } from '@/lib/online/session/frozen-finished-round';
import { buildOnlineResultsView } from '@/lib/online/online-results-data';
import {
  getFinishedRoundArchive,
  parseArchiveRouteKey,
} from '@/lib/online/session/online-session-archive';
import { useResultsRoundLexicon } from '@/hooks/useResultsRoundLexicon';
import type { PlayableLexiconSnapshot } from '@/lib/dictionary/round-playable-lexicon';

/**
 * Archived online round results (offline snapshot).
 */
export default function ArchivedRoundResultsScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { archiveKey: rawArchiveKey } = useLocalSearchParams<{ archiveKey: string }>();
  const archiveKey = rawArchiveKey ?? '';
  const myUid = useOnlineViewerUid();

  const parsed = useMemo(() => parseArchiveRouteKey(archiveKey), [archiveKey]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [viewData, setViewData] = useState<ReturnType<typeof buildOnlineResultsView> | null>(null);
  const [highlightPlayerId, setHighlightPlayerId] = useState('');
  const [archiveSession, setArchiveSession] = useState<GameSession | null>(null);
  const [archiveLexicon, setArchiveLexicon] = useState<PlayableLexiconSnapshot | null>(null);
  const { lexicon: roundLexicon, loading: lexiconLoading } = useResultsRoundLexicon(
    archiveSession,
    { archiveSnapshot: archiveLexicon },
  );

  useEffect(() => {
    if (!parsed) {
      setMissing(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoading(true);
      const frozen = await loadFrozenFinishedRoundFromArchive(parsed.gameId, parsed.baseWordRound);
      const archive = await getFinishedRoundArchive(parsed.gameId, parsed.baseWordRound);
      if (cancelled) {
        return;
      }
      if (!frozen) {
        setMissing(true);
        setViewData(null);
        setLoading(false);
        return;
      }

      const data = buildOnlineResultsView(t, frozen.session, frozen.words, {
        finishedAtMs: frozen.session.finishedAt ?? frozen.savedAt,
        viewerUid: myUid || undefined,
      });
      const playerIds = Object.keys(frozen.session.players);
      const highlight = myUid && frozen.session.players[myUid] ? myUid : (playerIds[0] ?? '');
      setHighlightPlayerId(highlight);
      setArchiveSession(frozen.session);
      setArchiveLexicon(archive?.playableLexicon ?? null);
      setViewData(data);
      setMissing(false);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [myUid, parsed, t]);

  const screenOptions = useMemo(() => {
    if (!viewData || !parsed) {
      return stackHeaderWithBackAndSettings(() => {
        router.back();
      });
    }

    return {
      ...stackHeaderWithBackAndSettings(() => {
        router.back();
      }),
      headerTitle: () => (
        <StackHeaderTitle
          title={viewData.baseWordDisplay}
          subtitle={t('history.roomCode', { code: parsed.gameId })}
        />
      ),
      headerTitleAlign: 'center' as const,
    };
  }, [parsed, t, viewData]);

  if (loading) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </>
    );
  }

  if (missing || !viewData) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <View style={styles.center}>
          <PrimaryButton
            label={t('history.backToList')}
            variant="secondary"
            onPress={() => {
              router.replace('/history');
            }}
          />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <RoundResultsView
        headline={
          viewData.isSolo && roundLexicon && roundLexicon.maxCount > 0
            ? (formatSoloSuccessHistoryHeadline(
                t,
                resolveRoundSuccessLevel(viewData.totalDistinctWords, roundLexicon.maxCount),
                viewData.totalDistinctWords,
              ) ?? viewData.headline)
            : viewData.headline
        }
        baseWordDisplay={viewData.baseWordDisplay}
        totalDistinctWords={viewData.totalDistinctWords}
        maxPlayableWords={roundLexicon?.maxCount ?? null}
        roundLexicon={roundLexicon}
        lexiconLoading={lexiconLoading}
        globalWords={viewData.globalWords}
        playerRankGroups={viewData.playerRankGroups}
        highlightPlayerId={highlightPlayerId}
        defaultExpandedPlayerId={highlightPlayerId}
        showBaseWordInMeta={false}
        showScores={viewData.uniqueBonusEnabled}
        showWordAuthors={!viewData.isSolo}
        allowProperNouns={viewData.allowProperNouns}
        allowSlang={viewData.allowSlang}
        roundDurationSeconds={viewData.roundDurationSeconds}
        soloSuccessLexiconMax={viewData.isSolo ? (roundLexicon?.maxCount ?? null) : null}
        winnerOverride={
          !viewData.isSolo && isViewerWinner(viewData.playerRankGroups, highlightPlayerId)
        }
      />
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
  });
}
