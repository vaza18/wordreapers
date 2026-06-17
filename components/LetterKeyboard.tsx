import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { colors, radii, spacing } from '@/constants/theme';
import { computeLetterKeySize } from '@/lib/game/letter-keyboard';
import type { LetterKey } from '@/lib/game/letter-keyboard';

interface LetterKeyboardProps {
  keys: readonly LetterKey[];
  /** Key indices already pressed for the current draft (each physical key toggles once). */
  usedKeyIndices: ReadonlySet<number>;
  onPressKey: (index: number) => void;
}

/**
 * Interactive keyboard built from the base word letters.
 */
export function LetterKeyboard({ keys, usedKeyIndices, onPressKey }: LetterKeyboardProps) {
  const { width: screenWidth } = useWindowDimensions();
  const keySize = computeLetterKeySize(screenWidth);

  return (
    <View style={styles.grid}>
      {keys.map((key, index) => {
        const used = usedKeyIndices.has(index);
        return (
          <FeedbackPressable
            key={key.id}
            accessibilityRole="button"
            disabled={used}
            onPress={() => {
              onPressKey(index);
            }}
            style={[
              styles.key,
              { width: keySize, height: keySize },
              used ? styles.keyUsed : styles.keyAvailable,
            ]}
          >
            <Text style={[styles.keyLabel, used ? styles.keyLabelUsed : styles.keyLabelAvailable]}>
              {key.label}
            </Text>
          </FeedbackPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  key: {
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyAvailable: {
    backgroundColor: colors.penBlue,
  },
  keyUsed: {
    backgroundColor: colors.backgroundSecondary,
  },
  keyLabel: {
    fontSize: 22,
    fontWeight: '600',
  },
  keyLabelAvailable: {
    color: colors.penBlueMuted,
  },
  keyLabelUsed: {
    color: colors.textTertiary,
    fontWeight: '500',
  },
});
