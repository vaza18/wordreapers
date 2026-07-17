import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Animated, Easing, FlatList, StyleSheet, Text, View } from 'react-native';

import { useResolvedVisualEffects } from '@/hooks/useResolvedVisualEffects';
import { planAcceptedWordHighlight } from '@/lib/ui/accepted-word-highlight';
import { removeEntranceNormalized } from '@/lib/ui/word-list-entrance';
import {
  ACCEPTED_WORD_SCROLL_OPTIONS,
  PREFIX_NAV_SCROLL_OPTIONS,
  PREFIX_SCROLL_DEBOUNCE_MS,
  type WordListScrollOptions,
} from '@/lib/ui/word-list-scroll-behavior';
import { shouldSkipWordListRowRerender } from '@/lib/ui/word-list-row-memo';
import { wordListRowShowsX2Badge } from '@/lib/ui/word-list-row-slots';

import { ScrollableWordPanel } from '@/components/ScrollableWordPanel';
import {
  NotebookLineFiller,
  notebookFillerRowCount,
  notebookListCanScroll,
} from '@/components/notebook/NotebookLineFiller';
import type { createNotebookRowLineStyle } from '@/lib/notebook/row-line-style';
import { WordOverlapAvatars } from '@/components/WordOverlapAvatars';
import { useNotebookRowHeight } from '@/hooks/useNotebookRowHeight';
import { useNotebookRowLineStyle } from '@/hooks/useNotebookRowLineStyle';
import { useScrollablePanelMetrics } from '@/hooks/useScrollablePanelMetrics';
import { useVirtualWordListProps } from '@/hooks/useVirtualWordListProps';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { normalizeUk } from '@/lib/dictionary/normalize';
import { dismissWordOverlapTooltips } from '@/lib/ui/word-overlap-tooltip';
import {
  findLastAddedNormalized,
  findRowIndexByNormalized,
  rowScrollOffset,
} from '@/lib/ui/word-list-scroll';
import {
  buildSortedWordListRows,
  wordListRenderExtraData,
  type WordListRow,
} from '@/lib/ui/word-list-rows';
import type { ScoredWordEntry } from '@/lib/game/scoring';
import type { WordOverlapPeer } from '@/lib/game/word-overlap-peers';
import { scheduleIdleWork } from '@/lib/app/schedule-idle-work';

const STATIC_SCROLL_OPTIONS: WordListScrollOptions = {
  animated: false,
  retries: false,
};

interface WordListProps {
  entries: readonly (ScoredWordEntry & { overlapPeers?: readonly WordOverlapPeer[] })[];
  displays: readonly string[];
  draftPrefix?: string;
  /** x2 badge when unique-word scoring is active. */
  showScoreBadges?: boolean;
  /** Peer avatars when other players share the same word. */
  showOverlapPeers?: boolean;
  /**
   * When false, renders rows in a plain View (for nesting inside a parent ScrollView).
   * Default true — self-scrolling FlatList for the play screen.
   */
  scrollable?: boolean;
  /** Scroll to an accepted word once it appears in the sorted list. */
  scrollToNormalized?: string | null;
  /** Bumps on each accept so repeated scroll requests are not ignored. */
  scrollToRequestId?: number;
}

/** First alphabetically sorted row whose normalized form starts with `prefix`. */
function findPrefixScrollIndex(rows: readonly WordListRow[], prefix: string): number {
  if (prefix.length === 0 || rows.length === 0) {
    return -1;
  }

  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const row = rows[mid];
    if (!row) {
      break;
    }
    if (row.entry.normalized.localeCompare(prefix, 'uk') < 0) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  if (lo >= rows.length) {
    return -1;
  }
  const row = rows[lo];
  return row && row.entry.normalized.startsWith(prefix) ? lo : -1;
}

function scrollFlatListToRow(
  listRef: RefObject<FlatList<WordListRow> | null>,
  index: number,
  rowHeight: number,
  shouldContinue: () => boolean,
  options: WordListScrollOptions = ACCEPTED_WORD_SCROLL_OPTIONS,
): void {
  const offset = rowScrollOffset(index, rowHeight);

  const run = () => {
    if (!shouldContinue() || !listRef.current) {
      return;
    }
    listRef.current.scrollToOffset({ offset, animated: options.animated });
  };

  if (!options.retries) {
    scheduleIdleWork(run);
    return;
  }

  scheduleIdleWork(() => {
    requestAnimationFrame(() => {
      run();
      setTimeout(run, 50);
      setTimeout(run, 150);
    });
  });
}

/**
 * Split display text at the end of a normalized prefix (handles apostrophes in display).
 */
function splitDisplayByNormalizedPrefix(
  display: string,
  prefixNormalized: string,
): { prefix: string; rest: string } | null {
  if (prefixNormalized.length === 0) {
    return null;
  }
  const displayNormalized = normalizeUk(display);
  if (!displayNormalized.startsWith(prefixNormalized)) {
    return null;
  }

  let normCount = 0;
  let cutIndex = 0;
  for (let i = 0; i < display.length && normCount < prefixNormalized.length; i += 1) {
    const char = display[i];
    if (char !== undefined && !/[''ʼ`]/.test(char)) {
      normCount += 1;
    }
    cutIndex = i + 1;
  }

  return { prefix: display.slice(0, cutIndex), rest: display.slice(cutIndex) };
}

const ROW_ENTRANCE_OFFSET = 12;
const ROW_ENTRANCE_MS = 220;

function WordListRow({
  row,
  prefix,
  showScoreBadges,
  showOverlapPeers,
  styles,
  notebookRow,
  animateEntrance,
  showAcceptedHighlight,
  highlightFadeEnabled,
  onEntranceComplete,
  onHighlightComplete,
}: {
  row: WordListRow;
  prefix: string;
  showScoreBadges: boolean;
  showOverlapPeers: boolean;
  styles: ReturnType<typeof createStyles>;
  notebookRow: ReturnType<typeof createNotebookRowLineStyle>;
  animateEntrance: boolean;
  showAcceptedHighlight: boolean;
  highlightFadeEnabled: boolean;
  onEntranceComplete?: (normalized: string) => void;
  onHighlightComplete?: (normalized: string) => void;
}) {
  const split = splitDisplayByNormalizedPrefix(row.display, prefix);
  const showBadge = wordListRowShowsX2Badge(showScoreBadges, row.entry.badge);
  const opacity = useRef(new Animated.Value(animateEntrance ? 0 : 1)).current;
  const translateX = useRef(new Animated.Value(animateEntrance ? -ROW_ENTRANCE_OFFSET : 0)).current;
  const badgeScale = useRef(new Animated.Value(showBadge && animateEntrance ? 0 : 1)).current;
  const highlightOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animateEntrance) {
      return undefined;
    }

    let cancelled = false;
    const frameId = requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: ROW_ENTRANCE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: 0,
          duration: ROW_ENTRANCE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished && !cancelled) {
          onEntranceComplete?.(row.entry.normalized);
        }
      });

      if (showBadge) {
        Animated.spring(badgeScale, {
          toValue: 1,
          friction: 5,
          tension: 180,
          delay: ROW_ENTRANCE_MS * 0.35,
          useNativeDriver: true,
        }).start();
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      opacity.stopAnimation();
      translateX.stopAnimation();
      badgeScale.stopAnimation();
    };
  }, [
    animateEntrance,
    badgeScale,
    onEntranceComplete,
    opacity,
    row.entry.normalized,
    showBadge,
    translateX,
  ]);

  useEffect(() => {
    if (!showAcceptedHighlight) {
      highlightOpacity.setValue(0);
      return undefined;
    }

    const plan = planAcceptedWordHighlight(highlightFadeEnabled);
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const frameId = requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }

      highlightOpacity.setValue(plan.peakOpacity);

      if (plan.fadeMs !== null) {
        Animated.sequence([
          Animated.delay(plan.holdMs),
          Animated.timing(highlightOpacity, {
            toValue: 0,
            duration: plan.fadeMs,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start(({ finished }) => {
          if (finished && !cancelled) {
            onHighlightComplete?.(row.entry.normalized);
          }
        });
        return;
      }

      timeoutId = setTimeout(() => {
        if (cancelled) {
          return;
        }
        highlightOpacity.setValue(0);
        onHighlightComplete?.(row.entry.normalized);
      }, plan.holdMs);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      highlightOpacity.stopAnimation();
      highlightOpacity.setValue(0);
    };
  }, [
    highlightFadeEnabled,
    highlightOpacity,
    onHighlightComplete,
    row.entry.normalized,
    showAcceptedHighlight,
  ]);

  return (
    <Animated.View
      collapsable={false}
      style={[notebookRow.row, styles.row, { opacity, transform: [{ translateX }] }]}
    >
      {/* Stable child slots — Fabric crashes if badge/overlays mount/unmount while indices shift. */}
      <View
        pointerEvents="none"
        style={[styles.rowPrefixHighlight, !split ? styles.rowOverlayHidden : null]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.rowHighlight, { opacity: highlightOpacity }]}
      />
      <Text style={styles.word}>
        <Text style={split ? styles.wordPrefixStrong : styles.word}>
          {split ? split.prefix : row.display}
        </Text>
        <Text style={styles.wordRest}>{split ? split.rest : ''}</Text>
      </Text>
      <Animated.Text
        style={[
          styles.badgeX2,
          !showBadge ? styles.rowSlotHidden : null,
          { transform: [{ scale: badgeScale }] },
        ]}
      >
        {showBadge ? row.entry.badge : ' '}
      </Animated.Text>
      <View
        style={!showOverlapPeers || !row.entry.overlapPeers?.length ? styles.rowSlotHidden : null}
      >
        {showOverlapPeers && row.entry.overlapPeers && row.entry.overlapPeers.length > 0 ? (
          <WordOverlapAvatars peers={row.entry.overlapPeers} />
        ) : null}
      </View>
    </Animated.View>
  );
}

const MemoWordListRow = memo(WordListRow, shouldSkipWordListRowRerender);

/**
 * Alphabetically sorted accepted words with x2/x0 badges, draft prefix highlight, auto-scroll.
 */
export const WordList = memo(function WordList({
  entries,
  displays,
  draftPrefix = '',
  showScoreBadges = false,
  showOverlapPeers = true,
  scrollable = true,
  scrollToNormalized = null,
  scrollToRequestId,
}: WordListProps) {
  const styles = useThemedStyles(createStyles);
  const notebookRow = useNotebookRowLineStyle();
  const rowHeight = useNotebookRowHeight();
  const virtualList = useVirtualWordListProps();
  const { generalMotion } = useResolvedVisualEffects();
  const acceptScrollOptions = generalMotion ? ACCEPTED_WORD_SCROLL_OPTIONS : STATIC_SCROLL_OPTIONS;
  const prefix = normalizeUk(draftPrefix);
  const listRef = useRef<FlatList<WordListRow>>(null);
  const rowsRef = useRef<readonly WordListRow[]>([]);
  const panelScroll = useScrollablePanelMetrics();
  const {
    onScroll: onPanelScroll,
    onContentSizeChange: onPanelContentSizeChange,
    onViewportLayout,
    scrollbar,
    scrollMetrics,
    scrollEventThrottle,
  } = panelScroll;
  const acceptedSnapshotRef = useRef<readonly string[] | null>(null);
  const scrollTargetRef = useRef<string | null>(null);
  const scrollGenerationRef = useRef(0);
  const lastScrollRequestIdRef = useRef(0);
  const prefixScrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingAcceptedScroll, setPendingAcceptedScroll] = useState(false);
  const [entranceNormalizes, setEntranceNormalizes] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [highlightNormalizes, setHighlightNormalizes] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const rows = useMemo(
    () => buildSortedWordListRows(entries, displays, rowsRef.current),
    [displays, entries],
  );
  rowsRef.current = rows;

  const renderSnapshotRef = useRef({
    prefix,
    entranceNormalizes,
    highlightNormalizes,
    generalMotion,
    showScoreBadges,
    showOverlapPeers,
    styles,
    notebookRow,
  });
  renderSnapshotRef.current = {
    prefix,
    entranceNormalizes,
    highlightNormalizes,
    generalMotion,
    showScoreBadges,
    showOverlapPeers,
    styles,
    notebookRow,
  };

  const listExtraDataMarker = wordListRenderExtraData(
    prefix,
    entranceNormalizes,
    highlightNormalizes,
  );
  const listExtraData = useMemo(
    () => ({
      marker: listExtraDataMarker,
      generalMotion,
      showScoreBadges,
      showOverlapPeers,
      styles,
      notebookRow,
    }),
    [generalMotion, listExtraDataMarker, notebookRow, showOverlapPeers, showScoreBadges, styles],
  );

  const viewportHeight = scrollMetrics.viewportHeight;
  const fillerRowCount = notebookFillerRowCount(rows.length, viewportHeight, spacing.sm, rowHeight);
  const canScroll = notebookListCanScroll(rows.length, viewportHeight, spacing.sm, rowHeight);

  const handleEntranceComplete = useCallback((normalized: string) => {
    setEntranceNormalizes((current) => removeEntranceNormalized(current, normalized));
  }, []);

  const handleHighlightComplete = useCallback((normalized: string) => {
    setHighlightNormalizes((current) => removeEntranceNormalized(current, normalized));
  }, []);

  const queueScrollToNormalized = useCallback(
    (normalized: string) => {
      scrollGenerationRef.current += 1;
      scrollTargetRef.current = normalized;
      setPendingAcceptedScroll(true);
      setHighlightNormalizes((current) => {
        if (current.has(normalized)) {
          return current;
        }
        const next = new Set(current);
        next.add(normalized);
        return next;
      });
      if (generalMotion) {
        setEntranceNormalizes((current) => {
          if (current.has(normalized)) {
            return current;
          }
          const next = new Set(current);
          next.add(normalized);
          return next;
        });
      }
    },
    [generalMotion],
  );

  const flushPendingScroll = useCallback(() => {
    const target = scrollTargetRef.current;
    if (!scrollable || !target) {
      return;
    }

    const index = findRowIndexByNormalized(rowsRef.current, target);
    if (index < 0) {
      return;
    }

    const generation = scrollGenerationRef.current;
    scrollTargetRef.current = null;
    setPendingAcceptedScroll(false);
    scrollFlatListToRow(
      listRef,
      index,
      rowHeight,
      () => scrollGenerationRef.current === generation,
      acceptScrollOptions,
    );
  }, [acceptScrollOptions, rowHeight, scrollable]);

  const handleContentSizeChange = useCallback(
    (width: number, height: number) => {
      onPanelContentSizeChange(width, height);
      if (scrollTargetRef.current) {
        flushPendingScroll();
      }
    },
    [flushPendingScroll, onPanelContentSizeChange],
  );

  const rowSignature = useMemo(() => rows.map((row) => row.entry.normalized).join('\0'), [rows]);

  const ruledPaperFooter = useMemo(
    () => <NotebookLineFiller rowCount={fillerRowCount} />,
    [fillerRowCount],
  );

  useEffect(() => {
    if (!scrollable || prefix.length === 0 || rows.length === 0) {
      return;
    }

    const index = findPrefixScrollIndex(rows, prefix);
    if (index < 0) {
      return;
    }

    if (prefixScrollDebounceRef.current) {
      clearTimeout(prefixScrollDebounceRef.current);
    }
    prefixScrollDebounceRef.current = setTimeout(() => {
      prefixScrollDebounceRef.current = null;
      scrollFlatListToRow(listRef, index, rowHeight, () => true, PREFIX_NAV_SCROLL_OPTIONS);
    }, PREFIX_SCROLL_DEBOUNCE_MS);

    return () => {
      if (prefixScrollDebounceRef.current) {
        clearTimeout(prefixScrollDebounceRef.current);
        prefixScrollDebounceRef.current = null;
      }
    };
  }, [prefix, rowHeight, rowSignature, rows, scrollable]);

  useEffect(() => {
    if (!scrollToNormalized || scrollToRequestId == null) {
      return;
    }
    if (lastScrollRequestIdRef.current === scrollToRequestId) {
      return;
    }
    lastScrollRequestIdRef.current = scrollToRequestId;
    queueScrollToNormalized(normalizeUk(scrollToNormalized));
  }, [queueScrollToNormalized, scrollToNormalized, scrollToRequestId]);

  useEffect(() => {
    const currentSnapshot = entries.map((entry) => entry.normalized);
    const previousSnapshot = acceptedSnapshotRef.current;

    if (previousSnapshot === null) {
      acceptedSnapshotRef.current = currentSnapshot;
      return;
    }

    acceptedSnapshotRef.current = currentSnapshot;

    if (scrollToRequestId != null) {
      return;
    }

    const lastAdded = findLastAddedNormalized(previousSnapshot, currentSnapshot);
    if (lastAdded) {
      queueScrollToNormalized(lastAdded);
    }
  }, [entries, queueScrollToNormalized, scrollToRequestId]);

  useEffect(() => {
    if (!scrollTargetRef.current) {
      return;
    }
    flushPendingScroll();
  }, [flushPendingScroll, rowSignature]);

  const renderItem = useCallback(
    ({ item: row }: { item: WordListRow }) => {
      const snapshot = renderSnapshotRef.current;
      return (
        <MemoWordListRow
          row={row}
          prefix={snapshot.prefix}
          showScoreBadges={snapshot.showScoreBadges}
          showOverlapPeers={snapshot.showOverlapPeers}
          styles={snapshot.styles}
          notebookRow={snapshot.notebookRow}
          animateEntrance={
            snapshot.generalMotion && snapshot.entranceNormalizes.has(row.entry.normalized)
          }
          showAcceptedHighlight={snapshot.highlightNormalizes.has(row.entry.normalized)}
          highlightFadeEnabled={snapshot.generalMotion}
          onEntranceComplete={handleEntranceComplete}
          onHighlightComplete={handleHighlightComplete}
        />
      );
    },
    [handleEntranceComplete, handleHighlightComplete],
  );

  if (!scrollable) {
    return (
      <View style={styles.staticList}>
        {rows.map((row) => (
          <MemoWordListRow
            key={row.key}
            row={row}
            prefix={prefix}
            showScoreBadges={showScoreBadges}
            showOverlapPeers={showOverlapPeers}
            styles={styles}
            notebookRow={notebookRow}
            animateEntrance={generalMotion && entranceNormalizes.has(row.entry.normalized)}
            showAcceptedHighlight={highlightNormalizes.has(row.entry.normalized)}
            highlightFadeEnabled={generalMotion}
            onEntranceComplete={handleEntranceComplete}
            onHighlightComplete={handleHighlightComplete}
          />
        ))}
      </View>
    );
  }

  return (
    <ScrollableWordPanel scrollbar={scrollbar}>
      <View style={styles.listViewport} onLayout={onViewportLayout}>
        <FlatList
          ref={listRef}
          data={rows}
          extraData={listExtraData}
          keyExtractor={(row: WordListRow) => row.key}
          style={styles.list}
          ListFooterComponent={ruledPaperFooter}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={canScroll || pendingAcceptedScroll}
          removeClippedSubviews={virtualList.removeClippedSubviews}
          onScroll={onPanelScroll}
          onScrollBeginDrag={() => {
            dismissWordOverlapTooltips();
          }}
          onContentSizeChange={handleContentSizeChange}
          scrollEventThrottle={scrollEventThrottle}
          getItemLayout={virtualList.getItemLayout}
          initialNumToRender={virtualList.initialNumToRender}
          maxToRenderPerBatch={virtualList.maxToRenderPerBatch}
          windowSize={virtualList.windowSize}
          updateCellsBatchingPeriod={virtualList.updateCellsBatchingPeriod}
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({
              offset: rowScrollOffset(info.index, rowHeight),
              animated: true,
            });
          }}
          renderItem={renderItem}
        />
      </View>
    </ScrollableWordPanel>
  );
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    listViewport: {
      flex: 1,
      minHeight: 0,
    },
    list: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    staticList: {
      gap: 0,
    },
    listContent: {
      paddingBottom: spacing.sm,
      backgroundColor: colors.notebookPaper,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      overflow: 'visible',
      zIndex: 1,
    },
    rowPrefixHighlight: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.prefixHighlightBg,
    },
    rowHighlight: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.penBlueMuted,
    },
    rowOverlayHidden: {
      opacity: 0,
    },
    rowSlotHidden: {
      opacity: 0,
      width: 0,
      overflow: 'hidden',
    },
    word: {
      flex: 1,
      fontSize: 18,
      fontWeight: '500',
      color: colors.penBlue,
    },
    wordPrefixStrong: {
      fontWeight: '800',
      color: colors.textPrimary,
    },
    wordRest: {
      fontWeight: '500',
      color: colors.penBlue,
    },
    badgeX2: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.accent,
    },
  });
}
