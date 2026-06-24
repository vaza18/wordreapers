import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

interface GamePlayStatusBarProps {
  timerLabel: string;
  timerUrgent?: boolean;
  rank: number;
  wordCount: number;
  /** When set, shows `found/max` (e.g. 12/571сл). */
  maxWordCount?: number | null;
  score: number;
  wordsShort: string;
  pointsShort: string;
  showRank?: boolean;
  showScore?: boolean;
  style?: ViewStyle;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderTertiary,
      paddingBottom: spacing.sm,
      gap: spacing.sm,
    },
    timer: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.accent,
      flexShrink: 0,
    },
    timerUrgent: {
      fontSize: 26,
      color: colors.dangerLight,
    },
    stats: {
      flex: 1,
      fontSize: 17,
      fontWeight: '600',
      color: colors.textSecondary,
      textAlign: 'right',
    },
  });
}

/**
 * Timer + standings strip with safe-area padding (avoids camera notch / punch-hole).
 */
export function GamePlayStatusBar({
  timerLabel,
  timerUrgent = false,
  rank,
  wordCount,
  maxWordCount = null,
  score,
  wordsShort,
  pointsShort,
  showRank = true,
  showScore = true,
  style,
}: GamePlayStatusBarProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const horizontal = Math.max(insets.left, insets.right, spacing.md);

  const statsParts: string[] = [];
  if (showRank) {
    statsParts.push(`${rank}м`);
  }
  const wordsLabel =
    maxWordCount != null && maxWordCount > 0
      ? `${wordCount}/${maxWordCount}${wordsShort}`
      : `${wordCount}${wordsShort}`;
  statsParts.push(wordsLabel);
  if (showScore) {
    statsParts.push(`${score}${pointsShort}`);
  }

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + spacing.xs,
          paddingLeft: horizontal,
          paddingRight: horizontal,
        },
        style,
      ]}
    >
      <Text style={[styles.timer, timerUrgent ? styles.timerUrgent : null]}>{timerLabel}</Text>
      <Text style={styles.stats}>{statsParts.join(' · ')}</Text>
    </View>
  );
}
