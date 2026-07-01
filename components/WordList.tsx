import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { scheduleIdleWork } from '@/lib/app/schedule-idle-work';

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
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { normalizeUk, toDisplayUpper } from '@/lib/dictionary/normalize';
import { dismissWordOverlapTooltips } from '@/lib/ui/word-overlap-tooltip';
import {
  findLastAddedNormalized,
  findRowIndexByNormalized,
  rowScrollOffset,
} from '@/lib/ui/word-list-scroll';
import type { ScoredWordEntry } from '@/lib/game/scoring';
import type { WordOverlapPeer } from '@/lib/game/word-overlap-peers';

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

interface WordRow {
  key: string;
  entry: ScoredWordEntry & { overlapPeers?: readonly WordOverlapPeer[] };
  display: string;
}

/** First alphabetically sorted row whose normalized form starts with `prefix`. */
function findPrefixScrollIndex(rows: readonly WordRow[], prefix: string): number {
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
  listRef: RefObject<FlatList<WordRow> | null>,
  index: number,
  rowHeight: number,
  shouldContinue: () => boolean,
): void {
  const offset = rowScrollOffset(index, rowHeight);

  const run = () => {
    if (!shouldContinue() || !listRef.current) {
      return;
    }
    listRef.current.scrollToOffset({ offset, animated: true });
  };

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

function WordListRow({
  row,
  prefix,
  showScoreBadges,
  showOverlapPeers,
  styles,
  notebookRow,
}: {
  row: WordRow;
  prefix: string;
  showScoreBadges: boolean;
  showOverlapPeers: boolean;
  styles: ReturnType<typeof createStyles>;
  notebookRow: ReturnType<typeof createNotebookRowLineStyle>;
}) {
  const split = splitDisplayByNormalizedPrefix(row.display, prefix);

  return (
    <View style={[notebookRow.row, styles.row, split ? styles.rowPrefixMatch : null]}>
      {split ? (
        <Text style={styles.word}>
          <Text style={styles.wordPrefixStrong}>{split.prefix}</Text>
          <Text style={styles.wordRest}>{split.rest}</Text>
        </Text>
      ) : (
        <Text style={styles.word}>{row.display}</Text>
      )}
      {showScoreBadges && row.entry.badge === 'x2' ? (
        <Text style={styles.badgeX2}>{row.entry.badge}</Text>
      ) : null}
      {showOverlapPeers && row.entry.overlapPeers && row.entry.overlapPeers.length > 0 ? (
        <WordOverlapAvatars peers={row.entry.overlapPeers} />
      ) : null}
    </View>
  );
}

const MemoWordListRow = memo(WordListRow);

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
  const prefix = normalizeUk(draftPrefix);
  const listRef = useRef<FlatList<WordRow>>(null);
  const rowsRef = useRef<readonly WordRow[]>([]);
  const panelScroll = useScrollablePanelMetrics();
  const acceptedSnapshotRef = useRef<readonly string[] | null>(null);
  const scrollTargetRef = useRef<string | null>(null);
  const scrollGenerationRef = useRef(0);
  const lastScrollRequestIdRef = useRef(0);
  const [pendingAcceptedScroll, setPendingAcceptedScroll] = useState(false);

  const rows = useMemo(
    () =>
      entries
        .map((entry, index) => ({
          key: `${entry.normalized}-${displays[index] ?? entry.normalized}`,
          entry,
          display: displays[index] ?? toDisplayUpper(entry.normalized),
        }))
        .sort((a, b) => a.entry.normalized.localeCompare(b.entry.normalized, 'uk')),
    [displays, entries],
  );
  rowsRef.current = rows;

  const viewportHeight = panelScroll.scrollMetrics.viewportHeight;
  const fillerRowCount = notebookFillerRowCount(rows.length, viewportHeight, spacing.sm, rowHeight);
  const canScroll = notebookListCanScroll(rows.length, viewportHeight, spacing.sm, rowHeight);

  const queueScrollToNormalized = useCallback((normalized: string) => {
    scrollGenerationRef.current += 1;
    scrollTargetRef.current = normalized;
    setPendingAcceptedScroll(true);
  }, []);

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
    );
  }, [rowHeight, scrollable]);

  const handleContentSizeChange = useCallback(
    (width: number, height: number) => {
      panelScroll.onContentSizeChange(width, height);
      if (scrollTargetRef.current) {
        flushPendingScroll();
      }
    },
    [flushPendingScroll, panelScroll],
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

    scrollFlatListToRow(listRef, index, rowHeight, () => true);
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
    ({ item: row }: { item: WordRow }) => (
      <MemoWordListRow
        row={row}
        prefix={prefix}
        showScoreBadges={showScoreBadges}
        showOverlapPeers={showOverlapPeers}
        styles={styles}
        notebookRow={notebookRow}
      />
    ),
    [notebookRow, prefix, showOverlapPeers, showScoreBadges, styles],
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
          />
        ))}
      </View>
    );
  }

  return (
    <ScrollableWordPanel scrollbar={panelScroll.scrollbar}>
      <View style={styles.listViewport} onLayout={panelScroll.onViewportLayout}>
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(row) => row.key}
          style={styles.list}
          ListFooterComponent={ruledPaperFooter}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={canScroll || pendingAcceptedScroll}
          removeClippedSubviews={false}
          onScroll={panelScroll.onScroll}
          onScrollBeginDrag={() => {
            dismissWordOverlapTooltips();
          }}
          onContentSizeChange={handleContentSizeChange}
          scrollEventThrottle={panelScroll.scrollEventThrottle}
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
    rowPrefixMatch: {
      backgroundColor: colors.prefixHighlightBg,
      borderRadius: radii.sm,
      marginHorizontal: -spacing.xs,
      paddingHorizontal: spacing.sm,
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
