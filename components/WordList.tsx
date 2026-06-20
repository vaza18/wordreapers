import { useEffect, useMemo, useRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { ScrollableWordPanel } from '@/components/ScrollableWordPanel';
import { WordOverlapAvatars } from '@/components/WordOverlapAvatars';
import { useScrollablePanelMetrics } from '@/hooks/useScrollablePanelMetrics';
import { colors, radii, spacing } from '@/constants/theme';
import { normalizeUk, toDisplayUpper } from '@/lib/dictionary/normalize';
import { dismissWordOverlapTooltips } from '@/lib/ui/word-overlap-tooltip';
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

const ROW_HEIGHT = 42;

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
}: {
  row: WordRow;
  prefix: string;
  showScoreBadges: boolean;
  showOverlapPeers: boolean;
}) {
  const split = splitDisplayByNormalizedPrefix(row.display, prefix);

  return (
    <View style={[styles.row, split ? styles.rowPrefixMatch : null]}>
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

/**
 * Alphabetically sorted accepted words with x2/x0 badges, draft prefix highlight, auto-scroll.
 */
export function WordList({
  entries,
  displays,
  draftPrefix = '',
  showScoreBadges = false,
  showOverlapPeers = true,
  scrollable = true,
}: WordListProps) {
  const prefix = normalizeUk(draftPrefix);
  const listRef = useRef<FlatList<WordRow>>(null);
  const panelScroll = useScrollablePanelMetrics();

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

  useEffect(() => {
    if (!scrollable || prefix.length === 0 || rows.length === 0) {
      return;
    }

    const index = findPrefixScrollIndex(rows, prefix);
    if (index < 0) {
      return;
    }

    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, [prefix, rows, scrollable]);

  if (!scrollable) {
    return (
      <View style={styles.staticList}>
        {rows.map((row) => (
          <WordListRow
            key={row.key}
            row={row}
            prefix={prefix}
            showScoreBadges={showScoreBadges}
            showOverlapPeers={showOverlapPeers}
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
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
          onScroll={panelScroll.onScroll}
          onScrollBeginDrag={() => {
            dismissWordOverlapTooltips();
          }}
          onContentSizeChange={panelScroll.onContentSizeChange}
          scrollEventThrottle={panelScroll.scrollEventThrottle}
          getItemLayout={(_, index) => ({
            length: ROW_HEIGHT,
            offset: ROW_HEIGHT * index,
            index,
          })}
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({
              offset: ROW_HEIGHT * info.index,
              animated: true,
            });
          }}
          renderItem={({ item: row }) => (
            <WordListRow
              row={row}
              prefix={prefix}
              showScoreBadges={showScoreBadges}
              showOverlapPeers={showOverlapPeers}
            />
          )}
        />
      </View>
    </ScrollableWordPanel>
  );
}

const styles = StyleSheet.create({
  listViewport: {
    flex: 1,
    minHeight: 0,
  },
  list: {
    flex: 1,
  },
  staticList: {
    gap: 0,
  },
  listContent: {
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: ROW_HEIGHT,
    paddingVertical: spacing.xs,
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
