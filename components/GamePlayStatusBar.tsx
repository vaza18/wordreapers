import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/constants/theme';

interface GamePlayStatusBarProps {
  timerLabel: string;
  timerUrgent?: boolean;
  rank: number;
  wordCount: number;
  score: number;
  wordsShort: string;
  pointsShort: string;
  showRank?: boolean;
  showScore?: boolean;
  style?: ViewStyle;
}

/**
 * Timer + standings strip with safe-area padding (avoids camera notch / punch-hole).
 */
export function GamePlayStatusBar({
  timerLabel,
  timerUrgent = false,
  rank,
  wordCount,
  score,
  wordsShort,
  pointsShort,
  showRank = true,
  showScore = true,
  style,
}: GamePlayStatusBarProps) {
  const insets = useSafeAreaInsets();
  const horizontal = Math.max(insets.left, insets.right, spacing.md);

  const statsParts: string[] = [];
  if (showRank) {
    statsParts.push(`${rank}м`);
  }
  statsParts.push(`${wordCount}${wordsShort}`);
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

const styles = StyleSheet.create({
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
    color: '#E24B4A',
  },
  stats: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'right',
  },
});
