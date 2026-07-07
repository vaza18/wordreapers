import { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { WordList } from '@/components/WordList';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import type { PlayWordFeedbackVariant } from '@/lib/game/play-word-feedback';
import type { ScoredWordEntry } from '@/lib/game/scoring';
import type { WordOverlapPeer } from '@/lib/game/word-overlap-peers';

export interface OnlinePlayWordListSectionProps {
  entries: readonly (ScoredWordEntry & { overlapPeers?: readonly WordOverlapPeer[] })[];
  displays: readonly string[];
  draftPrefix: string;
  scrollToNormalized?: string | null;
  scrollToRequestId?: number;
  feedback: string | null;
  feedbackVariant?: PlayWordFeedbackVariant;
  backgroundSyncing: boolean;
  showScoreBadges: boolean;
  showOverlapPeers: boolean;
}

function feedbackChipStyle(
  colors: ThemeColors,
  variant: PlayWordFeedbackVariant,
): { backgroundColor: string; color: string; borderColor: string } {
  switch (variant) {
    case 'success':
      return {
        backgroundColor: colors.accent,
        color: colors.textOnAccent,
        borderColor: colors.accent,
      };
    case 'warning':
      return {
        backgroundColor: colors.composeDraftBg,
        color: colors.composeDraftText,
        borderColor: colors.alert,
      };
    default:
      return {
        backgroundColor: colors.feedbackToastBg,
        color: colors.textPrimary,
        borderColor: colors.borderSecondary,
      };
  }
}

function createStyles(colors: ThemeColors) {
  void colors;
  return StyleSheet.create({
    wordListSection: {
      flex: 1,
      minHeight: 0,
    },
    feedbackSlot: {
      minHeight: 32,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    feedbackToast: {
      fontSize: 13,
      fontWeight: '600',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.sm,
      overflow: 'hidden',
      borderWidth: 1,
    },
    syncIndicatorSlot: {
      position: 'absolute',
      right: spacing.xs,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      opacity: 0.7,
    },
  });
}

/**
 * Accepted words + draft prefix navigation — memoized apart from compose panel.
 */
export const OnlinePlayWordListSection = memo(function OnlinePlayWordListSection({
  entries,
  displays,
  draftPrefix,
  scrollToNormalized = null,
  scrollToRequestId,
  feedback,
  feedbackVariant = 'default',
  backgroundSyncing,
  showScoreBadges,
  showOverlapPeers,
}: OnlinePlayWordListSectionProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const chipColors = feedbackChipStyle(colors, feedbackVariant);

  return (
    <View style={styles.wordListSection}>
      <WordList
        entries={entries}
        displays={displays}
        draftPrefix={draftPrefix}
        scrollToNormalized={scrollToNormalized}
        scrollToRequestId={scrollToRequestId}
        showScoreBadges={showScoreBadges}
        showOverlapPeers={showOverlapPeers}
      />
      <View style={styles.feedbackSlot}>
        {feedback ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[
              styles.feedbackToast,
              {
                backgroundColor: chipColors.backgroundColor,
                color: chipColors.color,
                borderColor: chipColors.borderColor,
              },
            ]}
          >
            {feedback}
          </Text>
        ) : null}
        {backgroundSyncing ? (
          <View
            style={styles.syncIndicatorSlot}
            pointerEvents="none"
            accessibilityLabel="Синхронізація з сервером"
            accessibilityRole="progressbar"
          >
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        ) : null}
      </View>
    </View>
  );
});
