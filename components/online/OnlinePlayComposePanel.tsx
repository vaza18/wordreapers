import { memo, useCallback, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ClearDraftIcon } from '@/components/ComposeActionIcons';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { LetterKeyboard, type KeyRect } from '@/components/LetterKeyboard';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useComposePanelLayout } from '@/hooks/useComposePanelLayout';
import { useLetterKeyboardLayout } from '@/hooks/useLetterKeyboardLayout';
import { usePressScale } from '@/hooks/usePressScale';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { toDisplayUpper } from '@/lib/dictionary/normalize';
import { draftLetterFlyEndpoints } from '@/lib/game/draft-letter-fly';
import type { LetterKey } from '@/lib/game/letter-keyboard';
import { centeredSquareTextStyle } from '@/lib/ui/centered-square-text';

const COMPOSE_HIT_SLOP = 6;
const COMPOSE_KEY_PRESS_SCALE = 0.9;
const DRAFT_LETTER_SPACING = 1;
const FLY_DURATION_MS = 240;

export interface OnlinePlayComposePanelProps {
  draft: string;
  draftKeyIndices: readonly number[];
  letterKeys: readonly LetterKey[];
  onPressKey: (index: number) => void;
  onClearDraft: () => void;
  onBackspaceDraft: () => void;
}

/**
 * Draft row + letter keyboard — memoized so session sync does not re-render keys.
 */
export const OnlinePlayComposePanel = memo(function OnlinePlayComposePanel({
  draft,
  draftKeyIndices,
  letterKeys,
  onPressKey,
  onClearDraft,
  onBackspaceDraft,
}: OnlinePlayComposePanelProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { onLayout, keySize: composeKeySize, gap } = useLetterKeyboardLayout();
  const { draftFontSize, backspaceGlyphSize, clearIconSize } =
    useComposePanelLayout(composeKeySize);
  const usedKeyIndices = new Set(draftKeyIndices);

  const panelRef = useRef<View>(null);
  const draftBoxRef = useRef<View>(null);
  const measuredDraftWidthRef = useRef(0);
  const flyPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const flyOpacity = useRef(new Animated.Value(0)).current;
  const [flyLetter, setFlyLetter] = useState<string | null>(null);

  const handleKeyMeasure = useCallback(
    (index: number, rect: KeyRect) => {
      const label = letterKeys[index]?.label;
      const panel = panelRef.current;
      const box = draftBoxRef.current;
      if (!label || !panel || !box) {
        return;
      }
      panel.measureInWindow((panelX, panelY) => {
        box.measureInWindow((boxX, boxY, boxWidth, boxHeight) => {
          const { start, end } = draftLetterFlyEndpoints({
            keyRect: rect,
            panelOrigin: { x: panelX, y: panelY },
            draftBox: { x: boxX, y: boxY, width: boxWidth, height: boxHeight },
            measuredDraftWidth: measuredDraftWidthRef.current,
            draftFontSize,
            draftPaddingHorizontal: spacing.md,
          });
          flyPosition.setValue(start);
          flyOpacity.setValue(1);
          setFlyLetter(label);
          Animated.parallel([
            Animated.timing(flyPosition, {
              toValue: end,
              duration: FLY_DURATION_MS,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(flyOpacity, {
              toValue: 0,
              duration: FLY_DURATION_MS,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
          ]).start(({ finished }) => {
            if (finished) {
              setFlyLetter(null);
            }
          });
        });
      });
    },
    [draftFontSize, flyOpacity, flyPosition, letterKeys],
  );

  const clearScale = usePressScale(COMPOSE_KEY_PRESS_SCALE);
  const backspaceScale = usePressScale(COMPOSE_KEY_PRESS_SCALE);

  const handleClearDraft = useCallback(() => {
    measuredDraftWidthRef.current = 0;
    onClearDraft();
  }, [onClearDraft]);

  const handleBackspaceDraft = useCallback(() => {
    if (draft.length <= 1) {
      measuredDraftWidthRef.current = 0;
    }
    onBackspaceDraft();
  }, [draft.length, onBackspaceDraft]);

  return (
    <View ref={panelRef} style={styles.panel} onLayout={onLayout}>
      <View style={styles.composeRow}>
        <Animated.View style={{ transform: [{ scale: clearScale.scale }] }}>
          <FeedbackPressable
            accessibilityRole="button"
            accessibilityLabel={t('game.clearDraft')}
            hitSlop={COMPOSE_HIT_SLOP}
            onPressIn={clearScale.onPressIn}
            onPressOut={clearScale.onPressOut}
            onPress={handleClearDraft}
            style={[
              styles.composeKey,
              { width: composeKeySize, height: composeKeySize },
              styles.composeKeyDanger,
            ]}
          >
            <ClearDraftIcon size={clearIconSize} color={colors.textOnAccent} />
          </FeedbackPressable>
        </Animated.View>
        <View ref={draftBoxRef} style={[styles.draftBox, { height: composeKeySize }]}>
          <Text
            allowFontScaling={false}
            adjustsFontSizeToFit
            minimumFontScale={0.45}
            numberOfLines={1}
            onTextLayout={(event) => {
              measuredDraftWidthRef.current =
                draft.length === 0 ? 0 : (event.nativeEvent.lines[0]?.width ?? 0);
            }}
            style={[
              styles.draftText,
              {
                fontSize: draftFontSize,
                lineHeight: composeKeySize,
                height: composeKeySize,
              },
            ]}
          >
            {toDisplayUpper(draft) || ' '}
          </Text>
        </View>
        <Animated.View style={{ transform: [{ scale: backspaceScale.scale }] }}>
          <FeedbackPressable
            accessibilityRole="button"
            accessibilityLabel={t('game.backspaceDraft')}
            hitSlop={COMPOSE_HIT_SLOP}
            onPressIn={backspaceScale.onPressIn}
            onPressOut={backspaceScale.onPressOut}
            onPress={handleBackspaceDraft}
            style={[
              styles.composeKey,
              { width: composeKeySize, height: composeKeySize },
              styles.composeKeyAlert,
            ]}
          >
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={[
                styles.composeKeyLabel,
                centeredSquareTextStyle(composeKeySize, backspaceGlyphSize),
              ]}
            >
              ⌫
            </Text>
          </FeedbackPressable>
        </Animated.View>
      </View>

      <LetterKeyboard
        keys={letterKeys}
        usedKeyIndices={usedKeyIndices}
        onPressKey={onPressKey}
        onKeyMeasure={handleKeyMeasure}
        keySize={composeKeySize}
        gap={gap}
      />

      {flyLetter ? (
        <Animated.Text
          pointerEvents="none"
          allowFontScaling={false}
          style={[
            styles.flyLetter,
            {
              fontSize: draftFontSize,
              opacity: flyOpacity,
              transform: flyPosition.getTranslateTransform(),
            },
          ]}
        >
          {flyLetter}
        </Animated.Text>
      ) : null}
    </View>
  );
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    panel: {
      gap: spacing.sm,
    },
    composeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    composeKey: {
      borderRadius: radii.sm,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    composeKeyDanger: {
      backgroundColor: colors.dangerLight,
    },
    composeKeyAlert: {
      backgroundColor: colors.alert,
    },
    composeKeyLabel: {
      color: colors.textOnAccent,
      fontWeight: '700',
    },
    draftBox: {
      flex: 1,
      backgroundColor: colors.composeDraftBg,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      justifyContent: 'center',
      overflow: 'hidden',
    },
    draftText: {
      fontWeight: '600',
      letterSpacing: DRAFT_LETTER_SPACING,
      color: colors.composeDraftText,
    },
    flyLetter: {
      position: 'absolute',
      top: 0,
      left: 0,
      fontWeight: '700',
      color: colors.penBlue,
    },
  });
}
