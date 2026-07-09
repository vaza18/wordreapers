import { memo, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { MenuIcon, StarIcon } from '@/components/HeaderIcons';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import {
  formatPlayStatsAccessible,
  formatPlayStatsCompactSegments,
} from '@/lib/game/format-play-stats';
import { useResolvedVisualEffects } from '@/hooks/useResolvedVisualEffects';

/** Matches timer line box + chrome so menu and stats buttons align with the timer chip. */
const ACTION_BUTTON_HEIGHT = 44;

/** Gold fill for the standings star when the viewer leads (matches ResultsByPlayer tierTop). */
const RANK_FIRST_STAR_COLOR = '#FAC775';

interface GamePlayStatusBarProps {
  timerLabel: string;
  timerUrgent?: boolean;
  timerCritical?: boolean;
  rank: number;
  wordCount: number;
  /** When set, shows `found/max` (e.g. 12/571сл). */
  maxWordCount?: number | null;
  score: number;
  wordsShort: string;
  pointsShort: string;
  showRank?: boolean;
  showScore?: boolean;
  menuLabel?: string;
  onMenuPress?: () => void;
  onAddTimePress?: () => void;
  addTimeAccessibilityLabel?: string;
  onStandingsPress?: () => void;
  standingsAccessibilityLabel?: string;
  onStatsPress?: () => void;
  statsAccessibilityLabel?: string;
  style?: ViewStyle;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderTertiary,
      paddingBottom: spacing.sm,
    },
    leftGroup: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: spacing.xs,
      flexShrink: 0,
    },
    statsSlot: {
      flex: 1,
      minWidth: 0,
      marginLeft: spacing.sm,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'stretch',
    },
    actionButton: {
      backgroundColor: colors.backgroundPrimary,
      borderWidth: 1,
      borderColor: colors.borderSecondary,
      borderRadius: radii.md,
      minHeight: ACTION_BUTTON_HEIGHT,
      justifyContent: 'center',
      alignItems: 'center',
    },
    menuButton: {
      width: ACTION_BUTTON_HEIGHT,
      paddingHorizontal: 0,
    },
    timerButton: {
      paddingHorizontal: spacing.sm,
    },
    timerButtonPressable: {
      backgroundColor: colors.accentMuted,
      borderColor: colors.accent,
    },
    timerButtonPressableUrgent: {
      borderColor: colors.dangerLight,
    },
    timer: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.accent,
      flexShrink: 0,
      fontVariant: ['tabular-nums'],
    },
    timerUrgent: {
      color: colors.dangerLight,
    },
    statsButton: {
      flexDirection: 'row',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      maxWidth: '100%',
      flexShrink: 1,
    },
    stats: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.textSecondary,
      flexShrink: 1,
    },
    statsDeemphasized: {
      fontSize: 13,
    },
    statsPlain: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.textSecondary,
      textAlign: 'right',
      flexShrink: 1,
      maxWidth: '100%',
    },
  });
}

/**
 * Play header: menu + timer (left), standings chip on the right (grows left only when cramped).
 * Pressable timer uses accent fill + border instead of a trailing "+" affordance.
 */
export const GamePlayStatusBar = memo(function GamePlayStatusBar({
  timerLabel,
  timerUrgent = false,
  timerCritical = false,
  rank,
  wordCount,
  maxWordCount = null,
  score,
  wordsShort,
  pointsShort,
  showRank = true,
  showScore = true,
  menuLabel,
  onMenuPress,
  onAddTimePress,
  addTimeAccessibilityLabel,
  onStandingsPress,
  standingsAccessibilityLabel,
  onStatsPress,
  statsAccessibilityLabel,
  style,
}: GamePlayStatusBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const timerPulse = useResolvedVisualEffects().timerPulse;
  const timerPulseAnim = useRef(new Animated.Value(1)).current;
  const horizontal = Math.max(insets.left, insets.right, spacing.md);

  const shouldPulseTimer = timerCritical && timerPulse;

  useEffect(() => {
    if (!shouldPulseTimer) {
      timerPulseAnim.stopAnimation();
      timerPulseAnim.setValue(1);
      return undefined;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(timerPulseAnim, {
          toValue: 1.08,
          duration: 420,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(timerPulseAnim, {
          toValue: 1,
          duration: 420,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [shouldPulseTimer, timerPulseAnim]);

  const statsInput = {
    rank,
    wordCount,
    maxWordCount,
    score,
    showRank,
    showScore,
  };
  const statsText = formatPlayStatsCompactSegments(statsInput, {
    rankSuffix: 'м',
    wordsSuffix: wordsShort,
    pointsSuffix: pointsShort,
  });
  const statsAccessibleText = formatPlayStatsAccessible(statsInput);
  const starColor = showRank && rank === 1 ? RANK_FIRST_STAR_COLOR : colors.textSecondary;
  const timerPressable = onAddTimePress != null;

  const renderStatsLabel = (
    textStyle: typeof styles.stats | typeof styles.statsPlain,
    accessibilityLabel?: string,
  ) => (
    <Text
      style={textStyle}
      accessibilityLabel={accessibilityLabel}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.85}
    >
      {statsText.map((segment, index) => (
        <Text
          key={`${index}-${segment.text}`}
          style={segment.variant === 'deemphasized' ? styles.statsDeemphasized : undefined}
        >
          {segment.text}
        </Text>
      ))}
    </Text>
  );

  const timerText = (
    <Animated.Text
      style={[
        styles.timer,
        timerUrgent ? styles.timerUrgent : null,
        shouldPulseTimer ? { transform: [{ scale: timerPulseAnim }] } : null,
      ]}
    >
      {timerLabel}
    </Animated.Text>
  );

  const timerChrome = timerPressable
    ? [
        styles.actionButton,
        styles.timerButton,
        styles.timerButtonPressable,
        timerUrgent ? styles.timerButtonPressableUrgent : null,
      ]
    : [styles.actionButton, styles.timerButton];

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
      <View style={styles.leftGroup}>
        {onMenuPress && menuLabel ? (
          <FeedbackPressable
            accessibilityRole="button"
            accessibilityLabel={menuLabel}
            onPress={onMenuPress}
            style={[styles.actionButton, styles.menuButton]}
          >
            <MenuIcon color={colors.textPrimary} />
          </FeedbackPressable>
        ) : null}

        {timerPressable ? (
          <FeedbackPressable
            accessibilityRole="button"
            accessibilityLabel={addTimeAccessibilityLabel ?? timerLabel}
            onPress={onAddTimePress}
            style={timerChrome}
          >
            {timerText}
          </FeedbackPressable>
        ) : (
          <View style={timerChrome}>{timerText}</View>
        )}
      </View>

      <View style={styles.statsSlot}>
        {onStandingsPress ? (
          <FeedbackPressable
            accessibilityRole="button"
            accessibilityLabel={standingsAccessibilityLabel ?? statsAccessibleText}
            onPress={onStandingsPress}
            style={[styles.actionButton, styles.statsButton]}
          >
            <StarIcon size={16} color={starColor} />
            {renderStatsLabel(styles.stats)}
          </FeedbackPressable>
        ) : onStatsPress ? (
          <FeedbackPressable
            accessibilityRole="button"
            accessibilityLabel={statsAccessibilityLabel ?? statsAccessibleText}
            onPress={onStatsPress}
            style={[styles.actionButton, styles.statsButton]}
          >
            {renderStatsLabel(styles.stats)}
          </FeedbackPressable>
        ) : (
          renderStatsLabel(styles.statsPlain, statsAccessibleText)
        )}
      </View>
    </View>
  );
});
