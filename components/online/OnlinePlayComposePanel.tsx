import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ClearDraftIcon } from '@/components/ComposeActionIcons';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { LetterKeyboard } from '@/components/LetterKeyboard';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useComposePanelLayout } from '@/hooks/useComposePanelLayout';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { toDisplayUpper } from '@/lib/dictionary/normalize';
import type { LetterKey } from '@/lib/game/letter-keyboard';
import { centeredSquareTextStyle } from '@/lib/ui/centered-square-text';

const COMPOSE_HIT_SLOP = 6;

export interface OnlinePlayComposePanelProps {
  draft: string;
  draftKeyIndices: readonly number[];
  letterKeys: readonly LetterKey[];
  composeKeySize: number;
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
  composeKeySize,
  onPressKey,
  onClearDraft,
  onBackspaceDraft,
}: OnlinePlayComposePanelProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { draftFontSize, backspaceGlyphSize, clearIconSize } =
    useComposePanelLayout(composeKeySize);
  const usedKeyIndices = new Set(draftKeyIndices);

  return (
    <>
      <View style={styles.composeRow}>
        <FeedbackPressable
          accessibilityRole="button"
          accessibilityLabel={t('game.clearDraft')}
          hitSlop={COMPOSE_HIT_SLOP}
          onPress={onClearDraft}
          style={[
            styles.composeKey,
            { width: composeKeySize, height: composeKeySize },
            styles.composeKeyDanger,
          ]}
        >
          <ClearDraftIcon size={clearIconSize} color={colors.textOnAccent} />
        </FeedbackPressable>
        <View style={[styles.draftBox, { height: composeKeySize }]}>
          <Text
            allowFontScaling={false}
            adjustsFontSizeToFit
            minimumFontScale={0.45}
            numberOfLines={1}
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
        <FeedbackPressable
          accessibilityRole="button"
          accessibilityLabel={t('game.backspaceDraft')}
          hitSlop={COMPOSE_HIT_SLOP}
          onPress={onBackspaceDraft}
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
      </View>

      <LetterKeyboard keys={letterKeys} usedKeyIndices={usedKeyIndices} onPressKey={onPressKey} />
    </>
  );
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
      letterSpacing: 1,
      color: colors.composeDraftText,
    },
  });
}
