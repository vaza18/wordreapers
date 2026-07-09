import { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ClearDraftIcon } from '@/components/ComposeActionIcons';
import { DraftDisplayText } from '@/components/DraftDisplayText';
import { DraftLetterFlyOverlay } from '@/components/DraftLetterFlyOverlay';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { LetterKeyboard, type KeyRect } from '@/components/LetterKeyboard';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useComposePanelLayout } from '@/hooks/useComposePanelLayout';
import { useDraftLetterFly, type PendingFlyLaunch } from '@/hooks/useDraftLetterFly';
import { useLetterKeyboardLayout } from '@/hooks/useLetterKeyboardLayout';
import { usePressScale } from '@/hooks/usePressScale';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { DRAFT_DISPLAY_LETTER_SPACING } from '@/constants/compose-draft';
import { toDisplayUpper } from '@/lib/dictionary/normalize';
import type { LetterKey } from '@/lib/game/letter-keyboard';
import { letterKeyFontSizeForKeySize } from '@/lib/game/letter-key-style';
import { playableGlyphFontSize } from '@/lib/typography/font-scale';
import { centeredSquareTextStyle } from '@/lib/ui/centered-square-text';

const COMPOSE_HIT_SLOP = 6;
const COMPOSE_KEY_PRESS_SCALE = 0.9;
const DRAFT_LETTER_SPACING = DRAFT_DISPLAY_LETTER_SPACING;

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
  const { width: screenWidth, fontScale } = useWindowDimensions();
  const { onLayout, keySize: composeKeySize, gap } = useLetterKeyboardLayout();
  const { draftFontSize, backspaceGlyphSize, clearIconSize } =
    useComposePanelLayout(composeKeySize);
  const keyLabelFontSize = useMemo(
    () =>
      playableGlyphFontSize(
        letterKeyFontSizeForKeySize(composeKeySize),
        fontScale,
        screenWidth,
        composeKeySize,
      ),
    [composeKeySize, fontScale, screenWidth],
  );
  const usedKeyIndices = useMemo(() => new Set(draftKeyIndices), [draftKeyIndices]);
  const draftDisplay = toDisplayUpper(draft) || ' ';

  const panelRef = useRef<View>(null);
  const draftTextRef = useRef<Text>(null);
  const draftLengthRef = useRef(draft.length);
  draftLengthRef.current = draft.length;
  const pendingLaunchQueueRef = useRef<PendingFlyLaunch[]>([]);

  const {
    activeFlies,
    revealVersion,
    stageFlyLaunch,
    syncFlyTargetsFromLayout,
    queueFlyForKey,
    resolvePendingFly,
    cancelCharAnimations,
    clearCharReveals,
    prunePendingFromCharIndex,
    isCharRevealing,
  } = useDraftLetterFly();

  const flushPendingLaunches = useCallback(() => {
    if (pendingLaunchQueueRef.current.length === 0) {
      return;
    }
    const draftLength = draftLengthRef.current;
    const ready: PendingFlyLaunch[] = [];
    const waiting: PendingFlyLaunch[] = [];
    for (const launch of pendingLaunchQueueRef.current) {
      if (draftLength > launch.charIndex) {
        ready.push(launch);
      } else {
        waiting.push(launch);
      }
    }
    pendingLaunchQueueRef.current = waiting;
    for (const launch of ready) {
      stageFlyLaunch(launch);
    }
  }, [stageFlyLaunch]);

  useLayoutEffect(() => {
    flushPendingLaunches();
  }, [draft, flushPendingLaunches]);

  const handlePressKey = useCallback(
    (index: number) => {
      queueFlyForKey(index, draft.length);
      onPressKey(index);
    },
    [draft.length, onPressKey, queueFlyForKey],
  );

  const handleKeyMeasure = useCallback(
    (index: number, rect: KeyRect) => {
      const pending = resolvePendingFly(index, draftLengthRef.current);
      if (!pending) {
        return;
      }

      const label = letterKeys[index]?.label;
      const panel = panelRef.current;
      if (!label || !panel) {
        return;
      }

      panel.measureInWindow((panelX, panelY) => {
        pendingLaunchQueueRef.current.push({
          charIndex: pending.charIndex,
          label,
          keyRect: rect,
          hostOrigin: { x: panelX, y: panelY },
          draftFontSize,
          keyLabelFontSize,
          draftLineHeight: composeKeySize,
          letterSpacing: DRAFT_LETTER_SPACING,
        });
        flushPendingLaunches();
      });
    },
    [
      draftFontSize,
      flushPendingLaunches,
      keyLabelFontSize,
      letterKeys,
      composeKeySize,
      resolvePendingFly,
    ],
  );

  const clearScale = usePressScale(COMPOSE_KEY_PRESS_SCALE);
  const backspaceScale = usePressScale(COMPOSE_KEY_PRESS_SCALE);

  const handleClearDraft = useCallback(() => {
    clearCharReveals();
    onClearDraft();
  }, [clearCharReveals, onClearDraft]);

  const handleBackspaceDraft = useCallback(() => {
    const removeIndex = draft.length - 1;
    if (removeIndex >= 0) {
      cancelCharAnimations(removeIndex);
      prunePendingFromCharIndex(removeIndex);
    }
    onBackspaceDraft();
  }, [cancelCharAnimations, draft.length, onBackspaceDraft, prunePendingFromCharIndex]);

  const handleDraftTextLayout = useCallback(
    (layout: { width: number; capHeight: number; lineHeight: number; lineTopOffset: number }) => {
      if (draft.length === 0) {
        return;
      }
      const text = draftTextRef.current;
      if (!text) {
        return;
      }
      text.measureInWindow((textX, textY) => {
        syncFlyTargetsFromLayout({
          width: layout.width,
          capHeight: layout.capHeight,
          charCount: draft.length,
          lineHeight: layout.lineHeight,
          lineTopOffset: layout.lineTopOffset,
          containerLineHeight: composeKeySize,
          letterSpacing: DRAFT_LETTER_SPACING,
          draftTextOrigin: { x: textX, y: textY },
        });
      });
    },
    [composeKeySize, draft.length, syncFlyTargetsFromLayout],
  );

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
        <View style={[styles.draftBox, { height: composeKeySize }]}>
          <DraftDisplayText
            ref={draftTextRef}
            display={draftDisplay}
            isCharRevealing={isCharRevealing}
            revealVersion={revealVersion}
            onTextLayout={handleDraftTextLayout}
            style={styles.draftText}
            fontSize={draftFontSize}
            height={composeKeySize}
          />
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
        onPressKey={handlePressKey}
        onKeyMeasure={handleKeyMeasure}
        keySize={composeKeySize}
        gap={gap}
      />

      {activeFlies.map((fly) => (
        <DraftLetterFlyOverlay
          key={`fly-${fly.charIndex}`}
          flyLetter={fly.letter}
          flyPosition={fly.position}
          flyScale={fly.scale}
          fontSize={fly.fontSize}
          lineHeight={fly.lineHeight}
          letterSpacing={fly.letterSpacing}
          style={styles.flyLetter}
        />
      ))}
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
      fontWeight: '600',
      color: colors.composeDraftText,
    },
  });
}
