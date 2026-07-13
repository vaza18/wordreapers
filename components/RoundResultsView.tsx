import type { ReactNode } from 'react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import {
  notebookFillerRowCount,
  notebookListCanScroll,
} from '@/components/notebook/NotebookLineFiller';
import { NotebookRuledFill } from '@/components/notebook/NotebookRuledFill';
import { PlaySessionToastStack } from '@/components/PlaySessionToast';
import {
  SCROLL_OVERFLOW_THRESHOLD,
  useScrollablePanelMetrics,
} from '@/hooks/useScrollablePanelMetrics';
import { useToastQueue } from '@/hooks/useToastQueue';
import { ResultsByPlayer } from '@/components/ResultsByPlayer';
import { ResultsGlobalWordList } from '@/components/ResultsGlobalWordList';
import { Screen } from '@/components/Screen';
import { ScrollableWordPanel } from '@/components/ScrollableWordPanel';
import { SettingSwitch } from '@/components/SettingSwitch';
import { useVictoryConfettiStore } from '@/store/victory-confetti-store';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useNotebookRowHeight } from '@/hooks/useNotebookRowHeight';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import type { RoundPlayableLexicon } from '@/lib/dictionary/round-playable-lexicon';
import type { GlobalResultWordRow, PlayerResultRankGroup } from '@/lib/game/results-view';
import { isViewerWinner } from '@/lib/game/is-viewer-winner';
import { buildResultsWordList } from '@/lib/game/results-missing-words';
import { formatRoundDuration } from '@/lib/game/round-duration';
import { resolveRoundSuccessLevel } from '@/lib/game/solo-round-success';
import { formatSoloSuccessBadge } from '@/lib/game/solo-round-success-i18n';
import { formatResultsLexiconOptionsSuffix } from '@/lib/online/play-rules-label';
import { formatUkWords, ukWordForm } from '@/lib/i18n/uk-plural';
import { dismissWordOverlapTooltips } from '@/lib/ui/word-overlap-tooltip';
import { useResolvedVisualEffects } from '@/hooks/useResolvedVisualEffects';

type ResultsTab = 'all' | 'players';

const HEADLINE_ENTRANCE_MS = 320;

function ResultsHeadline({ text, motionEnabled }: { text: string; motionEnabled: boolean }) {
  const styles = useThemedStyles(createStyles);
  const opacity = useRef(new Animated.Value(motionEnabled ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(motionEnabled ? 10 : 0)).current;

  useEffect(() => {
    if (!motionEnabled) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: HEADLINE_ENTRANCE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: HEADLINE_ENTRANCE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [motionEnabled, opacity, text, translateY]);

  return (
    <Animated.Text style={[styles.headline, { opacity, transform: [{ translateY }] }]}>
      {text}
    </Animated.Text>
  );
}

export interface RoundResultsViewProps {
  /** Optional green headline below the stack header; omit when the title lives in the header only. */
  headline?: string;
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
  /** Hide «Всі слова» / «По гравцях» tabs (solo training). */
  showTabs?: boolean;
  /** When set, show words/min in the stats line (solo training). */
  wordsPerMinuteInMeta?: number | null;
  allowProperNouns?: boolean;
  allowSlang?: boolean;
  showScores?: boolean;
  showWordAuthors?: boolean;
  roundDurationSeconds?: number;
  /** When true, «Показати незнайдені слова» is visible but not interactive (e.g. early exit while round plays). */
  missingWordsToggleDisabled?: boolean;
  /**
   * Override the victory-confetti trigger. When omitted, confetti shows if the
   * viewer is at rank 1 (multiplayer). Solo passes the training-milestone result.
   */
  winnerOverride?: boolean;
  /**
   * When set (>0), show solo success badge (offline training / solo archive).
   * Uses `totalDistinctWords` as the found-word count. No progress bar —
   * "words until next level" belongs on the live play screen only.
   */
  soloSuccessLexiconMax?: number | null;
}

/**
 * Shared round results UI — headline, stats, tabs, notebook, missing-words toggle, footer.
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
  showTabs = true,
  wordsPerMinuteInMeta = null,
  allowProperNouns = false,
  allowSlang = false,
  showScores = false,
  showWordAuthors = true,
  roundDurationSeconds,
  missingWordsToggleDisabled = false,
  winnerOverride,
  soloSuccessLexiconMax = null,
}: RoundResultsViewProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { victoryCelebration, generalMotion } = useResolvedVisualEffects();
  const rowHeight = useNotebookRowHeight();
  const { t } = useTranslation();
  const [tab, setTab] = useState<ResultsTab>('all');
  const [showMissingWords, setShowMissingWords] = useState(false);
  const deferredShowMissingWords = useDeferredValue(showMissingWords);
  const missingListPending = showMissingWords !== deferredShowMissingWords;
  const [playerBodyHeight, setPlayerBodyHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);

  useEffect(() => {
    if (missingWordsToggleDisabled) {
      setShowMissingWords(false);
    }
  }, [missingWordsToggleDisabled]);
  const panelScroll = useScrollablePanelMetrics();
  const roundDurationLabel =
    roundDurationSeconds != null ? formatRoundDuration(roundDurationSeconds) : null;
  const wordsMetaLabel = useMemo(() => {
    if (showBaseWordInMeta) {
      return maxPlayableWords != null && maxPlayableWords > 0
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
          });
    }
    return maxPlayableWords != null && maxPlayableWords > 0
      ? t('game.resultsWordsMetaWithMax', {
          count: totalDistinctWords,
          max: maxPlayableWords,
          wordsLabel: ukWordForm(totalDistinctWords),
        })
      : formatUkWords(totalDistinctWords);
  }, [baseWordDisplay, maxPlayableWords, showBaseWordInMeta, t, totalDistinctWords]);
  const statsLabel = useMemo(() => {
    const parts = [wordsMetaLabel];
    if (wordsPerMinuteInMeta != null) {
      parts.push(t('game.resultsWordsPerMinuteShort', { rate: wordsPerMinuteInMeta }));
    }
    if (roundDurationLabel) {
      parts.push(t('game.resultsRoundDuration', { duration: roundDurationLabel }));
    }
    const lexiconSuffix = formatResultsLexiconOptionsSuffix(t, {
      allowProperNouns,
      allowSlang,
    });
    if (lexiconSuffix) {
      parts.push(lexiconSuffix);
    }
    return parts.join(' · ');
  }, [allowProperNouns, allowSlang, roundDurationLabel, t, wordsMetaLabel, wordsPerMinuteInMeta]);
  const activeTab: ResultsTab = showTabs ? tab : 'all';
  const canShowMissingToggle = Boolean(roundLexicon) && !lexiconLoading;
  const allWordRows = useMemo(
    () => buildResultsWordList(globalWords, roundLexicon, deferredShowMissingWords),
    [deferredShowMissingWords, globalWords, roundLexicon],
  );
  const viewportHeight = panelScroll.scrollMetrics.viewportHeight;
  const contentHeight = panelScroll.scrollMetrics.contentHeight;
  const fillerRowCount =
    activeTab === 'all'
      ? notebookFillerRowCount(allWordRows.length, viewportHeight, spacing.md, rowHeight)
      : 0;
  const playersRuledHeight =
    activeTab === 'players' && viewportHeight > 0 ? Math.max(viewportHeight, playerBodyHeight) : 0;
  const canScroll =
    activeTab === 'all'
      ? notebookListCanScroll(allWordRows.length, viewportHeight, spacing.md, rowHeight)
      : viewportHeight > 0 && contentHeight > viewportHeight + SCROLL_OVERFLOW_THRESHOLD;

  const onPlayerBodyLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      const nextHeight = event.nativeEvent.layout.height;
      setPlayerBodyHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    },
    [],
  );
  const { toasts, enqueueToasts } = useToastQueue();
  const onMissingWordsDisabledPress = useCallback(() => {
    enqueueToasts([{ message: t('game.showMissingWordsAfterRound') }]);
  }, [enqueueToasts, t]);
  const onFooterLayout = useCallback((event: { nativeEvent: { layout: { height: number } } }) => {
    const nextHeight = event.nativeEvent.layout.height;
    setFooterHeight((prev) => (prev === nextHeight ? prev : nextHeight));
  }, []);
  const isWinner = winnerOverride ?? isViewerWinner(playerRankGroups, highlightPlayerId);
  const showVictoryConfetti = victoryCelebration && isWinner;
  const celebrate = useVictoryConfettiStore((state) => state.celebrate);
  const hasCelebratedRef = useRef(false);

  useEffect(() => {
    if (showVictoryConfetti && !hasCelebratedRef.current) {
      hasCelebratedRef.current = true;
      celebrate();
    }
  }, [celebrate, showVictoryConfetti]);

  const showSoloSuccess = soloSuccessLexiconMax != null && soloSuccessLexiconMax > 0;
  const soloSuccessLevel = showSoloSuccess
    ? resolveRoundSuccessLevel(totalDistinctWords, soloSuccessLexiconMax)
    : null;
  const soloSuccessBadge =
    soloSuccessLevel != null ? formatSoloSuccessBadge(t, soloSuccessLevel) : null;

  return (
    <>
      <Screen scroll={false} style={styles.screen}>
        <View style={styles.header}>
          {soloSuccessBadge ? (
            <Text style={styles.soloSuccessBadge}>{soloSuccessBadge}</Text>
          ) : null}
          {headline ? <ResultsHeadline text={headline} motionEnabled={generalMotion} /> : null}

          <Text style={styles.stats}>{statsLabel}</Text>

          {showTabs ? (
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
          ) : null}
        </View>

        <ScrollableWordPanel style={styles.wordPanel} scrollbar={panelScroll.scrollbar}>
          <View style={styles.panelScrollViewport} onLayout={panelScroll.onViewportLayout}>
            {activeTab === 'all' ? (
              <>
                <ResultsGlobalWordList
                  rows={allWordRows}
                  showAuthors={showWordAuthors}
                  showScoreBadges={showScores}
                  fillerRowCount={fillerRowCount}
                  scrollEnabled={canScroll}
                  onScroll={panelScroll.onScroll}
                  onScrollBeginDrag={() => {
                    dismissWordOverlapTooltips();
                  }}
                  onContentSizeChange={panelScroll.onContentSizeChange}
                  scrollEventThrottle={panelScroll.scrollEventThrottle}
                />
                {missingListPending ? (
                  <View pointerEvents="none" style={styles.missingListPending}>
                    <ActivityIndicator size="small" color={colors.accent} />
                  </View>
                ) : null}
              </>
            ) : (
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
                  {playersRuledHeight > 0 ? (
                    <NotebookRuledFill height={playersRuledHeight} style={styles.ruledBackdrop} />
                  ) : null}
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
                </View>
              </ScrollView>
            )}
          </View>
        </ScrollableWordPanel>

        {activeTab === 'all' && canShowMissingToggle ? (
          <View style={styles.missingWordsBar}>
            <SettingSwitch
              variant="compact"
              label={t('game.showMissingWords')}
              value={showMissingWords}
              onChange={setShowMissingWords}
              disabled={missingWordsToggleDisabled}
              onDisabledPress={missingWordsToggleDisabled ? onMissingWordsDisabledPress : undefined}
            />
          </View>
        ) : null}

        {footer ? (
          <View style={styles.actions} onLayout={onFooterLayout}>
            {footer}
          </View>
        ) : null}
      </Screen>
      {missingWordsToggleDisabled ? (
        <PlaySessionToastStack
          toasts={toasts}
          anchor="bottom"
          bottomOffset={footerHeight + spacing.sm}
        />
      ) : null}
    </>
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
  const styles = useThemedStyles(createStyles);
  return (
    <FeedbackPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.tab, active ? styles.tabActive : styles.tabIdle]}
    >
      <Text style={[styles.tabLabel, active ? styles.tabLabelActive : styles.tabLabelIdle]}>
        {label}
      </Text>
    </FeedbackPressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
    soloSuccessBadge: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
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
    stats: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    wordPanel: {
      marginHorizontal: spacing.md,
    },
    missingWordsBar: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
    },
    panelScrollViewport: {
      flex: 1,
      minHeight: 0,
    },
    missingListPending: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.notebookPaper,
      opacity: 0.72,
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
}
