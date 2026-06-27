import { memo, useCallback, useMemo } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { ResultWordAuthorAvatars } from '@/components/ResultWordAuthorAvatars';
import { NotebookLineFiller } from '@/components/notebook/NotebookLineFiller';
import type { createNotebookRowLineStyle } from '@/lib/notebook/row-line-style';
import { useNotebookRowLineStyle } from '@/hooks/useNotebookRowLineStyle';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import type { ResultsWordListRow } from '@/lib/game/results-missing-words';

interface ResultsGlobalWordListProps {
  rows: readonly ResultsWordListRow[];
  showAuthors?: boolean;
  showScoreBadges?: boolean;
  fillerRowCount: number;
  scrollEnabled: boolean;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDrag?: () => void;
  onContentSizeChange: (width: number, height: number) => void;
  scrollEventThrottle: number;
}

function ResultsWordRow({
  row,
  showAuthors,
  showScoreBadges,
  styles,
  notebookRow,
}: {
  row: ResultsWordListRow;
  showAuthors: boolean;
  showScoreBadges: boolean;
  styles: ReturnType<typeof createStyles>;
  notebookRow: ReturnType<typeof createNotebookRowLineStyle>;
}) {
  return (
    <View style={[notebookRow.row, styles.row]}>
      <Text style={[styles.word, !row.found ? styles.wordMissing : null]} numberOfLines={1}>
        {row.display}
      </Text>
      <View style={styles.meta}>
        {showAuthors && row.found && row.authors ? (
          <ResultWordAuthorAvatars authors={row.authors} showUniqueBadge={showScoreBadges} />
        ) : null}
        {showScoreBadges && row.showX2 ? <Text style={styles.x2}>x2</Text> : null}
      </View>
    </View>
  );
}

const MemoResultsWordRow = memo(ResultsWordRow);

/**
 * «Всі слова» tab — virtualized alphabetical list with compact author avatars.
 */
export function ResultsGlobalWordList({
  rows,
  showAuthors = true,
  showScoreBadges = false,
  fillerRowCount,
  scrollEnabled,
  onScroll,
  onScrollBeginDrag,
  onContentSizeChange,
  scrollEventThrottle,
}: ResultsGlobalWordListProps) {
  const styles = useThemedStyles(createStyles);
  const notebookRow = useNotebookRowLineStyle();

  const ruledPaperFooter = useMemo(
    () => <NotebookLineFiller rowCount={fillerRowCount} />,
    [fillerRowCount],
  );

  const renderItem = useCallback(
    ({ item: row }: { item: ResultsWordListRow }) => (
      <MemoResultsWordRow
        row={row}
        showAuthors={showAuthors}
        showScoreBadges={showScoreBadges}
        styles={styles}
        notebookRow={notebookRow}
      />
    ),
    [notebookRow, showAuthors, showScoreBadges, styles],
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.normalized}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      ListFooterComponent={ruledPaperFooter}
      showsVerticalScrollIndicator={false}
      scrollEnabled={scrollEnabled}
      removeClippedSubviews={false}
      keyboardShouldPersistTaps="handled"
      onScroll={onScroll}
      onScrollBeginDrag={onScrollBeginDrag}
      onContentSizeChange={onContentSizeChange}
      scrollEventThrottle={scrollEventThrottle}
      renderItem={renderItem}
    />
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    list: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    listContent: {
      paddingHorizontal: spacing.sm,
      paddingBottom: spacing.md,
      backgroundColor: colors.notebookPaper,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      overflow: 'visible',
    },
    word: {
      flex: 1,
      flexShrink: 1,
      fontSize: 16,
      fontWeight: '500',
      color: colors.penBlue,
    },
    wordMissing: {
      color: colors.textSecondary,
      fontWeight: '400',
    },
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: spacing.xs,
      flexShrink: 0,
      overflow: 'visible',
    },
    x2: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.accent,
    },
  });
}
