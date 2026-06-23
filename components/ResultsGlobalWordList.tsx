import { StyleSheet, Text, View } from 'react-native';

import { ResultWordAuthorAvatars } from '@/components/ResultWordAuthorAvatars';
import { createNotebookRowLineStyle } from '@/components/notebook/NotebookLineFiller';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import type { ResultsWordListRow } from '@/lib/game/results-missing-words';

interface ResultsGlobalWordListProps {
  rows: readonly ResultsWordListRow[];
  showAuthors?: boolean;
  showScoreBadges?: boolean;
}

/**
 * «Всі слова» tab — full alphabetical list with compact author avatars (scroll via parent).
 */
export function ResultsGlobalWordList({
  rows,
  showAuthors = true,
  showScoreBadges = false,
}: ResultsGlobalWordListProps) {
  const styles = useThemedStyles(createStyles);
  const notebookRow = useThemedStyles(createNotebookRowLineStyle);
  return (
    <View style={styles.list}>
      {rows.map((row) => (
        <View key={row.normalized} style={[notebookRow.row, styles.row]}>
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
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    list: {
      gap: 0,
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
