import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { LetterKeyboard } from '@/components/LetterKeyboard';
import { colors, radii, spacing } from '@/constants/theme';
import { toDisplayUpper } from '@/lib/dictionary/normalize';
import type { LetterKey } from '@/lib/game/letter-keyboard';

export interface OnlinePlayComposePanelProps {
  draft: string;
  draftKeyIndices: readonly number[];
  letterKeys: readonly LetterKey[];
  composeKeySize: number;
  composeKeyFontSize: number;
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
  composeKeyFontSize,
  onPressKey,
  onClearDraft,
  onBackspaceDraft,
}: OnlinePlayComposePanelProps) {
  const usedKeyIndices = new Set(draftKeyIndices);

  return (
    <>
      <View style={styles.composeRow}>
        <FeedbackPressable
          accessibilityRole="button"
          onPress={onClearDraft}
          style={[
            styles.composeKey,
            { width: composeKeySize, height: composeKeySize },
            styles.composeKeyDanger,
          ]}
        >
          <Text style={[styles.composeKeyLabel, { fontSize: composeKeyFontSize }]}>✕</Text>
        </FeedbackPressable>
        <View style={[styles.draftBox, { height: composeKeySize }]}>
          <Text style={styles.draftText}>{toDisplayUpper(draft) || ' '}</Text>
        </View>
        <FeedbackPressable
          accessibilityRole="button"
          onPress={onBackspaceDraft}
          style={[
            styles.composeKey,
            { width: composeKeySize, height: composeKeySize },
            styles.composeKeyOk,
          ]}
        >
          <Text style={[styles.composeKeyLabel, { fontSize: composeKeyFontSize }]}>←</Text>
        </FeedbackPressable>
      </View>

      <LetterKeyboard keys={letterKeys} usedKeyIndices={usedKeyIndices} onPressKey={onPressKey} />
    </>
  );
});

const styles = StyleSheet.create({
  composeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  composeKey: {
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeKeyDanger: {
    backgroundColor: '#E24B4A',
  },
  composeKeyOk: {
    backgroundColor: colors.accent,
  },
  composeKeyLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  draftBox: {
    flex: 1,
    backgroundColor: '#FAEEDA',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  draftText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1,
    color: '#412402',
  },
});
