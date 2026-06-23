import { StyleSheet, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { PLAYER_AVATAR_PALETTE, playerAvatarSwatch } from '@/constants/player-avatars';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

interface AvatarColorPickerProps {
  value: number;
  onChange: (index: number) => void;
  /** Compact row under centered avatar (mockup screen 2). */
  compact?: boolean;
}

/**
 * Pick avatar palette slot (0–5).
 */
export function AvatarColorPicker({ value, onChange, compact = false }: AvatarColorPickerProps) {
  const styles = useThemedStyles(createStyles);
  const swatchSize = compact ? 28 : 36;

  return (
    <View style={[styles.row, compact ? styles.rowCompact : null]}>
      {PLAYER_AVATAR_PALETTE.map((_, index) => {
        const active = index === value;
        return (
          <FeedbackPressable
            key={index}
            accessibilityRole="button"
            onPress={() => {
              onChange(index);
            }}
            style={[
              styles.swatch,
              {
                width: swatchSize,
                height: swatchSize,
                borderRadius: swatchSize / 2,
                backgroundColor: playerAvatarSwatch(index),
              },
              active ? styles.swatchActive : styles.swatchIdle,
            ]}
          >
            <View />
          </FeedbackPressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    rowCompact: {
      justifyContent: 'center',
      gap: spacing.sm,
    },
    swatch: {
      borderWidth: 2,
    },
    swatchIdle: {
      borderColor: colors.borderSecondary,
    },
    swatchActive: {
      borderColor: '#085041',
    },
  });
}
