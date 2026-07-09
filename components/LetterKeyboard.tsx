import { memo, useRef } from 'react';
import { Animated, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { type ThemeColors } from '@/constants/theme';
import { usePressScale } from '@/hooks/usePressScale';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { letterKeyProportions } from '@/lib/game/letter-key-style';
import { letterKeyFontSizeForKeySize } from '@/lib/game/letter-key-style';
import type { LetterKey } from '@/lib/game/letter-keyboard';
import { playableGlyphFontSize } from '@/lib/typography/font-scale';
import { centeredSquareTextStyle } from '@/lib/ui/centered-square-text';

const LETTER_KEY_HIT_SLOP = 6;
const KEY_PRESS_SCALE = 0.9;

export type KeyRect = { x: number; y: number; width: number; height: number };

interface LetterKeyButtonProps {
  label: string;
  used: boolean;
  index: number;
  keySize: number;
  borderRadius: number;
  labelFontSize: number;
  styles: ReturnType<typeof createStyles>;
  pressScaleEnabled: boolean;
  onPressKey: (index: number) => void;
  onKeyMeasure?: (index: number, rect: KeyRect) => void;
  accessibilityLabel: string;
}

function LetterKeyButton({
  label,
  used,
  index,
  keySize,
  borderRadius,
  labelFontSize,
  styles,
  pressScaleEnabled,
  onPressKey,
  onKeyMeasure,
  accessibilityLabel,
}: LetterKeyButtonProps) {
  const { scale, onPressIn, onPressOut } = usePressScale(KEY_PRESS_SCALE, pressScaleEnabled);
  const viewRef = useRef<View>(null);

  return (
    <Animated.View ref={viewRef} style={{ transform: [{ scale }] }}>
      <FeedbackPressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: used }}
        disabled={used}
        hitSlop={LETTER_KEY_HIT_SLOP}
        onPressIn={() => {
          if (!used) {
            onPressIn();
          }
        }}
        onPressOut={onPressOut}
        onPress={() => {
          if (used) {
            return;
          }
          onPressKey(index);
          if (onKeyMeasure) {
            viewRef.current?.measureInWindow((x, y, width, height) => {
              onKeyMeasure(index, { x, y, width, height });
            });
          }
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
          {label}
        </Text>
      </FeedbackPressable>
    </Animated.View>
  );
}

interface LetterKeyboardProps {
  keys: readonly LetterKey[];
  /** Key indices already pressed for the current draft (each physical key toggles once). */
  usedKeyIndices: ReadonlySet<number>;
  pressScaleEnabled?: boolean;
  onPressKey: (index: number) => void;
  /** Reports the pressed key's window rect, for the ghost-letter fly animation. */
  onKeyMeasure?: (index: number, rect: KeyRect) => void;
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
  pressScaleEnabled = true,
  onPressKey,
  onKeyMeasure,
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
          <LetterKeyButton
            key={key.id}
            label={key.label}
            used={used}
            index={index}
            keySize={keySize}
            borderRadius={borderRadius}
            labelFontSize={labelFontSize}
            styles={styles}
            pressScaleEnabled={pressScaleEnabled}
            onPressKey={onPressKey}
            onKeyMeasure={onKeyMeasure}
            accessibilityLabel={
              used
                ? t('game.letterKeyUsed', { letter: key.label })
                : t('game.letterKey', { letter: key.label })
            }
          />
        );
      })}
    </View>
  );
});
