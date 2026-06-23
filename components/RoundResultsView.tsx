import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import {
  NotebookLineFiller,
  notebookFillerRowCount,
  notebookListCanScroll,
} from '@/components/notebook/NotebookLineFiller';
import { NotebookRuledFill } from '@/components/notebook/NotebookRuledFill';
import {
  SCROLL_OVERFLOW_THRESHOLD,
  useScrollablePanelMetrics,
} from '@/hooks/useScrollablePanelMetrics';
import { ResultsByPlayer } from '@/components/ResultsByPlayer';
import { ResultsGlobalWordList } from '@/components/ResultsGlobalWordList';
import { Screen } from '@/components/Screen';
import { ScrollableWordPanel } from '@/components/ScrollableWordPanel';
import { SettingSwitch } from '@/components/SettingSwitch';
import { colors, radii, spacing } from '@/constants/theme';
import type { RoundPlayableLexicon } from '@/lib/dictionary/round-playable-lexicon';
import type { GlobalResultWordRow, PlayerResultRankGroup } from '@/lib/game/results-view';
import { buildResultsWordList } from '@/lib/game/results-missing-words';
import { formatRoundDuration } from '@/lib/game/round-duration';
import { formatUkWords, ukWordForm } from '@/lib/i18n/uk-plural';
import { dismissWordOverlapTooltips } from '@/lib/ui/word-overlap-tooltip';

type ResultsTab = 'all' | 'players';

export interface RoundResultsViewProps {
  headline: string;
  baseWordDisplay: string;
  totalDistinctWords: number;
  maxPlayableWords?: number | null;
  roundLexicon?: RoundPlayableLexicon | null;
  lexiconLoading?: boolean;
  globalWords: readonly GlobalResultWordRow[];
  playerRankGroups: readonly PlayerResultRankGroup[];
  highlightPlayerId: string;
  defaultExpandedPlayerId: string;
  footer?: ReactNode;
  /** When base word is shown in the stack header, hide it from the meta line. */
  showBaseWordInMeta?: boolean;
  showScores?: boolean;
  showWordAuthors?: boolean;
  roundDurationSeconds?: number;
}

/**
 * Shared round results UI — tabs «Всі слова» / «По гравцях» (local + online).
 */
export function RoundResultsView({
  headline,
  baseWordDisplay,
  totalDistinctWords,
  maxPlayableWords = null,
  roundLexicon = null,
  lexiconLoading = false,
  globalWords,
  playerRankGroups,
  highlightPlayerId,
  defaultExpandedPlayerId,
  footer,
  showBaseWordInMeta = true,
  showScores = false,
  showWordAuthors = true,
  roundDurationSeconds,
}: RoundResultsViewProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ResultsTab>('all');
  const [showMissingWords, setShowMissingWords] = useState(false);
  const [playerBodyHeight, setPlayerBodyHeight] = useState(0);
  const panelScroll = useScrollablePanelMetrics();
  const roundDurationLabel =
    roundDurationSeconds != null ? formatRoundDuration(roundDurationSeconds) : null;
  const canShowMissingToggle = Boolean(roundLexicon) && !lexiconLoading;
  const allWordRows = useMemo(
    () => buildResultsWordList(globalWords, roundLexicon, showMissingWords),
    [globalWords, roundLexicon, showMissingWords],
  );
  const viewportHeight = panelScroll.scrollMetrics.viewportHeight;
  const contentHeight = panelScroll.scrollMetrics.contentHeight;
  const fillerRowCount =
    tab === 'all' ? notebookFillerRowCount(allWordRows.length, viewportHeight, spacing.md) : 0;
  const playersRuledHeight =
    tab === 'players' && viewportHeight > 0 ? Math.max(viewportHeight, playerBodyHeight) : 0;
  const canScroll =
    tab === 'all'
      ? notebookListCanScroll(allWordRows.length, viewportHeight, spacing.md)
      : viewportHeight > 0 && contentHeight > viewportHeight + SCROLL_OVERFLOW_THRESHOLD;

  const onPlayerBodyLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      const nextHeight = event.nativeEvent.layout.height;
      setPlayerBodyHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    },
    [],
  );

  return (
    <Screen scroll={false} style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headline}>{headline}</Text>

        <View style={styles.tabs}>
          <TabButton
            label={t('game.resultsTabAll')}
            active={tab === 'all'}
            onPress={() => {
              setTab('all');
              setPlayerBodyHeight(0);
            }}
          />
          <TabButton
            label={t('game.resultsTabPlayers')}
            active={tab === 'players'}
            onPress={() => {
              setTab('players');
              setPlayerBodyHeight(0);
            }}
          />
        </View>

        <Text style={styles.meta}>
          {showBaseWordInMeta
            ? maxPlayableWords != null && maxPlayableWords > 0
              ? t('game.resultsBaseWordMetaWithMax', {
                  word: baseWordDisplay,
                  count: totalDistinctWords,
                  max: maxPlayableWords,
                  wordsLabel: ukWordForm(totalDistinctWords),
                })
              : t('game.resultsBaseWordMeta', {
                  word: baseWordDisplay,
                  count: totalDistinctWords,
                  wordsLabel: formatUkWords(totalDistinctWords),
                })
            : maxPlayableWords != null && maxPlayableWords > 0
              ? t('game.resultsWordsMetaWithMax', {
                  count: totalDistinctWords,
                  max: maxPlayableWords,
                  wordsLabel: ukWordForm(totalDistinctWords),
                })
              : formatUkWords(totalDistinctWords)}
        </Text>
        {tab === 'all' && canShowMissingToggle ? (
          <SettingSwitch
            label={t('game.showMissingWords')}
            value={showMissingWords}
            onChange={setShowMissingWords}
          />
        ) : null}
        {roundDurationLabel ? (
          <Text style={styles.meta}>
            {t('game.resultsRoundDuration', { duration: roundDurationLabel })}
          </Text>
        ) : null}
      </View>

      <ScrollableWordPanel style={styles.wordPanel} scrollbar={panelScroll.scrollbar}>
        <View style={styles.panelScrollViewport} onLayout={panelScroll.onViewportLayout}>
          <ScrollView
            style={styles.panelScroll}
            contentContainerStyle={styles.panelScrollContent}
            showsVerticalScrollIndicator={false}
            scrollEnabled={canScroll}
            keyboardShouldPersistTaps="handled"
            onScroll={panelScroll.onScroll}
            onScrollBeginDrag={() => {
              dismissWordOverlapTooltips();
            }}
            onContentSizeChange={panelScroll.onContentSizeChange}
            scrollEventThrottle={panelScroll.scrollEventThrottle}
          >
            <View style={styles.scrollBody}>
              {tab === 'players' && playersRuledHeight > 0 ? (
                <NotebookRuledFill height={playersRuledHeight} style={styles.ruledBackdrop} />
              ) : null}
              {tab === 'all' ? (
                <ResultsGlobalWordList
                  rows={allWordRows}
                  showAuthors={showWordAuthors}
                  showScoreBadges={showScores}
                />
              ) : (
                <View onLayout={onPlayerBodyLayout} style={styles.playerBody}>
                  <ResultsByPlayer
                    rankGroups={playerRankGroups}
                    pointsShort={t('game.pointsShort')}
                    wordsShort={t('game.wordsShort')}
                    youLabel={t('game.resultsYou')}
                    highlightPlayerId={highlightPlayerId}
                    defaultExpandedPlayerId={defaultExpandedPlayerId}
                    showScores={showScores}
                    showScoreBadges={showScores}
                    showOverlapPeers={showWordAuthors}
                    showWordsPerMinute={roundDurationSeconds != null}
                  />
                </View>
              )}
              {tab === 'all' ? <NotebookLineFiller rowCount={fillerRowCount} /> : null}
            </View>
          </ScrollView>
        </View>
      </ScrollableWordPanel>

      {footer ? <View style={styles.actions}>{footer}</View> : null}
    </Screen>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <FeedbackPressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.tab, active ? styles.tabActive : styles.tabIdle]}
    >
      <Text style={[styles.tabLabel, active ? styles.tabLabelActive : styles.tabLabelIdle]}>
        {label}
      </Text>
    </FeedbackPressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 0,
    gap: 0,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headline: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.accent,
  },
  tabs: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
  },
  tabActive: {
    backgroundColor: colors.accent,
  },
  tabIdle: {
    backgroundColor: colors.backgroundPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderTertiary,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#E1F5EE',
  },
  tabLabelIdle: {
    color: colors.textSecondary,
  },
  meta: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  wordPanel: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  panelScrollViewport: {
    flex: 1,
    minHeight: 0,
  },
  panelScroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  panelScrollContent: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
  },
  scrollBody: {
    flexGrow: 1,
    backgroundColor: colors.notebookPaper,
    position: 'relative',
  },
  ruledBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
  },
  playerBody: {
    zIndex: 1,
  },
  actions: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderTertiary,
    backgroundColor: colors.backgroundSecondary,
  },
});
