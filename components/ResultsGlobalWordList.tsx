import { StyleSheet, Text, View } from 'react-native';

import { playerAvatarColors } from '@/constants/player-avatars';
import { notebookRowLineStyle } from '@/components/notebook/NotebookLineFiller';
import { colors, spacing } from '@/constants/theme';
import type { GlobalResultWordRow, GlobalWordAuthor } from '@/lib/game/results-view';

interface ResultsGlobalWordListProps {
  rows: readonly GlobalResultWordRow[];
  showAuthors?: boolean;
  showScoreBadges?: boolean;
}

/**
 * «Всі слова» tab — full alphabetical list with author chips (scroll via parent).
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
          <Text style={styles.word}>{row.display}</Text>
          <View style={styles.badges}>
            {showAuthors
              ? row.authors.map((author) => (
                  <AuthorChip key={`${row.normalized}-${author.playerId}`} author={author} />
                ))
              : null}
            {showScoreBadges && row.showX2 ? <Text style={styles.x2}>x2</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function AuthorChip({ author }: { author: GlobalWordAuthor }) {
  const palette = playerAvatarColors(author.avatarColorIndex);

  return (
    <Text
      style={[
        styles.chip,
        {
          backgroundColor: palette.background,
          color: palette.color,
        },
      ]}
    >
      {author.playerName}
    </Text>
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
  },
  word: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.penBlue,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    maxWidth: '55%',
  },
  chip: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  x2: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
});
