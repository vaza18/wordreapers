import { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { WordList } from '@/components/WordList';
import { colors, radii, spacing } from '@/constants/theme';
import type { OnlineWordListRow } from '@/lib/online/online-word-display';

export interface OnlinePlayWordListSectionProps {
  entries: readonly OnlineWordListRow[];
  displays: readonly string[];
  draftPrefix: string;
  feedback: string | null;
  backgroundSyncing: boolean;
  showScoreBadges: boolean;
  showOverlapPeers: boolean;
}

/**
 * Accepted words + draft prefix navigation — memoized apart from compose panel.
 */
export const OnlinePlayWordListSection = memo(function OnlinePlayWordListSection({
  entries,
  displays,
  draftPrefix,
  feedback,
  backgroundSyncing,
  showScoreBadges,
  showOverlapPeers,
}: OnlinePlayWordListSectionProps) {
  return (
    <View style={styles.wordListSection}>
      <WordList
        entries={entries}
        displays={displays}
        draftPrefix={draftPrefix}
        showScoreBadges={showScoreBadges}
        showOverlapPeers={showOverlapPeers}
      />
      <View style={styles.feedbackSlot}>
        {feedback ? <Text style={styles.feedbackToast}>{feedback}</Text> : null}
        {backgroundSyncing ? (
          <ActivityIndicator size="small" color={colors.accent} style={styles.syncIndicator} />
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wordListSection: {
    flex: 1,
    minHeight: 0,
  },
  feedbackSlot: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  feedbackToast: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  syncIndicator: {
    opacity: 0.7,
  },
});
