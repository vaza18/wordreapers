import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useBaseWordSuggestLayout } from '@/hooks/useBaseWordSuggestLayout';
import { useThemedStyles } from '@/hooks/useThemedStyles';

export interface BaseWordSuggestItem {
  display: string;
  letterCount: number;
}

interface BaseWordSuggestDropdownProps {
  items: readonly BaseWordSuggestItem[];
  /** Total dictionary matches for prefix (may exceed `items.length`). */
  totalCount: number;
  onSelect: (display: string) => void;
  /** Mark suggest gesture on touch-down before TextInput blur handlers run. */
  onTouchSelectStart?: () => void;
  /** Clear suggest-blur suppress on press end (success or cancel). */
  onTouchSelectEnd?: () => void;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    dropdown: {
      backgroundColor: colors.backgroundPrimary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSecondary,
      borderRadius: radii.sm,
      marginTop: spacing.xs,
      overflow: 'hidden',
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 3,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderTertiary,
      borderLeftWidth: 3,
      borderLeftColor: 'transparent',
    },
    itemActive: {
      backgroundColor: colors.accentMuted,
      borderLeftColor: colors.accent,
    },
    itemWord: {
      flex: 1,
      fontSize: 15,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    itemWordActive: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    itemMeta: {
      fontSize: 12,
      color: colors.textTertiary,
      marginLeft: spacing.sm,
    },
    itemMetaActive: {
      color: colors.accent,
      fontWeight: '600',
    },
    moreRow: {
      backgroundColor: colors.backgroundSecondary,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    moreText: {
      fontSize: 12,
      color: colors.textTertiary,
      textAlign: 'center',
    },
  });
}

/**
 * Scrollable autocomplete dropdown for base word setup (mockup screen 3).
 */
export function BaseWordSuggestDropdown({
  items,
  totalCount,
  onSelect,
  onTouchSelectStart,
  onTouchSelectEnd,
}: BaseWordSuggestDropdownProps) {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const { rowHeight, maxListHeight, moreRowHeight } = useBaseWordSuggestLayout();

  if (items.length === 0) {
    return null;
  }

  const listHeight = Math.min(items.length * rowHeight, maxListHeight);
  const showMoreFooter = totalCount > items.length;

  return (
    <View style={styles.dropdown}>
      <ScrollView
        style={{ maxHeight: listHeight }}
        nestedScrollEnabled
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        showsVerticalScrollIndicator
      >
        {items.map((item, index) => {
          const active = index === 0;
          return (
            <FeedbackPressable
              key={item.display}
              accessibilityRole="button"
              onPressIn={() => {
                onTouchSelectStart?.();
              }}
              onPressOut={() => {
                onTouchSelectEnd?.();
              }}
              onPress={() => {
                onSelect(item.display);
              }}
              style={[styles.item, { height: rowHeight }, active ? styles.itemActive : null]}
            >
              <Text
                pointerEvents="none"
                style={[styles.itemWord, active ? styles.itemWordActive : null]}
              >
                {item.display}
              </Text>
              <Text
                pointerEvents="none"
                style={[styles.itemMeta, active ? styles.itemMetaActive : null]}
              >
                {item.letterCount} л.
              </Text>
            </FeedbackPressable>
          );
        })}
      </ScrollView>
      {showMoreFooter ? (
        <View style={[styles.moreRow, { minHeight: moreRowHeight }]} pointerEvents="none">
          <Text style={styles.moreText}>
            {t('game.baseWordSuggestMore', {
              count: Math.max(0, totalCount - items.length),
            })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
