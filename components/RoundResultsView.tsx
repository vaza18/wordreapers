import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { useScrollablePanelMetrics } from '@/hooks/useScrollablePanelMetrics';
import { ResultsByPlayer } from '@/components/ResultsByPlayer';
import { ResultsGlobalWordList } from '@/components/ResultsGlobalWordList';
import { Screen } from '@/components/Screen';
import { ScrollableWordPanel } from '@/components/ScrollableWordPanel';
import { colors, radii, spacing } from '@/constants/theme';
import type { GlobalResultWordRow, PlayerResultRankGroup } from '@/lib/game/results-view';
import { formatRoundDuration } from '@/lib/game/round-duration';
import { formatUkWords } from '@/lib/i18n/uk-plural';
import { dismissWordOverlapTooltips } from '@/lib/ui/word-overlap-tooltip';

type ResultsTab = 'all' | 'players';

export interface RoundResultsViewProps {
  headline: string;
  baseWordDisplay: string;
  totalDistinctWords: number;
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
  const panelScroll = useScrollablePanelMetrics();
  const roundDurationLabel =
    roundDurationSeconds != null ? formatRoundDuration(roundDurationSeconds) : null;

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
            }}
          />
          <TabButton
            label={t('game.resultsTabPlayers')}
            active={tab === 'players'}
            onPress={() => {
              setTab('players');
            }}
          />
        </View>

        <Text style={styles.meta}>
          {showBaseWordInMeta
            ? t('game.resultsBaseWordMeta', {
                word: baseWordDisplay,
                count: totalDistinctWords,
                wordsLabel: formatUkWords(totalDistinctWords),
              })
            : formatUkWords(totalDistinctWords)}
        </Text>
        {roundDurationLabel ? (
          <Text style={styles.meta}>
            {t('game.resultsRoundDuration', { duration: roundDurationLabel })}
          </Text>
        ) : null}
      </View>

      <ScrollableWordPanel
        style={styles.wordPanel}
        scrollbar={panelScroll.scrollbar}
        scrollMetrics={panelScroll.scrollMetrics}
      >
        <View style={styles.panelScrollViewport} onLayout={panelScroll.onViewportLayout}>
          <ScrollView
            style={styles.panelScroll}
            contentContainerStyle={[
              styles.panelScrollContent,
              panelScroll.scrollMetrics.viewportHeight > 0
                ? {
                    flexGrow: 1,
                    minHeight: panelScroll.scrollMetrics.viewportHeight,
                  }
                : null,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScroll={panelScroll.onScroll}
            onScrollBeginDrag={() => {
              dismissWordOverlapTooltips();
            }}
            onContentSizeChange={panelScroll.onContentSizeChange}
            scrollEventThrottle={panelScroll.scrollEventThrottle}
          >
            {tab === 'all' ? (
              <ResultsGlobalWordList
                rows={globalWords}
                showAuthors={showWordAuthors}
                showScoreBadges={showScores}
              />
            ) : (
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
            )}
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
  actions: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderTertiary,
    backgroundColor: colors.backgroundSecondary,
  },
});
