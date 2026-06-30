import { memo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { letterKeyProportions } from '@/lib/game/letter-key-style';
import { letterKeyFontSizeForKeySize } from '@/lib/game/letter-key-style';
import type { LetterKey } from '@/lib/game/letter-keyboard';
import { playableGlyphFontSize } from '@/lib/typography/font-scale';
import { centeredSquareTextStyle } from '@/lib/ui/centered-square-text';

const LETTER_KEY_HIT_SLOP = 6;

interface LetterKeyboardProps {
  keys: readonly LetterKey[];
  /** Key indices already pressed for the current draft (each physical key toggles once). */
  usedKeyIndices: ReadonlySet<number>;
  onPressKey: (index: number) => void;
  keySize: number;
  gap: number;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    key: {
      overflow: 'hidden',
    },
    keyAvailable: {
      backgroundColor: colors.penBlue,
    },
    keyUsed: {
      backgroundColor: colors.backgroundSecondary,
    },
    keyLabel: {
      fontWeight: '600',
    },
    keyLabelAvailable: {
      color: colors.textOnAccent,
    },
    keyLabelUsed: {
      color: colors.textSecondary,
      fontWeight: '500',
    },
  });
}

/** Interactive keyboard built from the base word letters. */
export const LetterKeyboard = memo(function LetterKeyboard({
  keys,
  usedKeyIndices,
  onPressKey,
  keySize,
  gap,
}: LetterKeyboardProps) {
  const { t } = useTranslation();
  const { width: screenWidth, fontScale } = useWindowDimensions();
  const styles = useThemedStyles(createStyles);
  const { borderRadius } = letterKeyProportions(screenWidth);
  const labelFontSize = playableGlyphFontSize(
    letterKeyFontSizeForKeySize(keySize),
    fontScale,
    screenWidth,
    keySize,
  );

  return (
    <View style={[styles.grid, { gap }]}>
      {keys.map((key, index) => {
        const used = usedKeyIndices.has(index);
        return (
          <FeedbackPressable
            key={key.id}
            accessibilityRole="button"
            accessibilityLabel={
              used
                ? t('game.letterKeyUsed', { letter: key.label })
                : t('game.letterKey', { letter: key.label })
            }
            accessibilityState={{ disabled: used }}
            disabled={used}
            hitSlop={LETTER_KEY_HIT_SLOP}
            onPress={() => {
              onPressKey(index);
            }}
            style={[
              styles.key,
              { width: keySize, height: keySize, borderRadius },
              used ? styles.keyUsed : styles.keyAvailable,
            ]}
          >
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={[
                styles.keyLabel,
                centeredSquareTextStyle(keySize, labelFontSize),
                used ? styles.keyLabelUsed : styles.keyLabelAvailable,
              ]}
            >
              {key.label}
            </Text>
          </FeedbackPressable>
        );
      })}
    </View>
  );
});
