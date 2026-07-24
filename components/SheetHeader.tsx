import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

/**
 * Bottom-sheet title row with ✕ close (left-aligned title; matches menu close glyph sizing).
 */
export function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();

  return (
    <View style={styles.row}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <FeedbackPressable
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        hitSlop={8}
        onPress={onClose}
        style={styles.closeButton}
      >
        <Text style={styles.closeGlyph}>✕</Text>
      </FeedbackPressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.xs,
      gap: spacing.sm,
    },
    title: {
      flex: 1,
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    closeButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.sm,
    },
    closeGlyph: {
      fontSize: 18,
      fontWeight: '500',
      color: colors.textSecondary,
      lineHeight: 22,
    },
  });
}
