import { StyleSheet, Text, View } from 'react-native';

import { ResultWordAuthorAvatars } from '@/components/ResultWordAuthorAvatars';
import { notebookRowLineStyle } from '@/components/notebook/NotebookLineFiller';
import { colors, spacing } from '@/constants/theme';
import type { GlobalResultWordRow } from '@/lib/game/results-view';

interface ResultsGlobalWordListProps {
  rows: readonly GlobalResultWordRow[];
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
  return (
    <View style={styles.list}>
      {rows.map((row) => (
        <View key={row.normalized} style={[notebookRowLineStyle.row, styles.row]}>
          <Text style={styles.word} numberOfLines={1}>
            {row.display}
          </Text>
          <View style={styles.meta}>
            {showAuthors ? (
              <ResultWordAuthorAvatars authors={row.authors} showUniqueBadge={showScoreBadges} />
            ) : null}
            {showScoreBadges && row.showX2 ? <Text style={styles.x2}>x2</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
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
