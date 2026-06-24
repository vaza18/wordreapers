import { StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { buildPageNumberWindow } from '@/lib/online/public-lobby/browse-pagination';

interface BrowsePaginationProps {
  currentPage: number;
  totalPages: number | null;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  onSelectPage: (page: number) => void;
}

export function BrowsePagination({
  currentPage,
  totalPages,
  onFirst,
  onPrev,
  onNext,
  onLast,
  onSelectPage,
}: BrowsePaginationProps) {
  const styles = useThemedStyles(createStyles);
  const pages = totalPages && totalPages > 0 ? buildPageNumberWindow(currentPage, totalPages) : [];
  const atFirst = currentPage <= 1;
  const atLast = totalPages !== null && currentPage >= totalPages;

  if (!totalPages || totalPages <= 1) {
    return null;
  }

  return (
    <View style={styles.row}>
      <FeedbackPressable
        accessibilityRole="button"
        disabled={atFirst}
        onPress={onFirst}
        style={[styles.navBtn, atFirst && styles.navBtnDisabled]}
      >
        <Text style={styles.navText}>««</Text>
      </FeedbackPressable>
      <FeedbackPressable
        accessibilityRole="button"
        disabled={atFirst}
        onPress={onPrev}
        style={[styles.navBtn, atFirst && styles.navBtnDisabled]}
      >
        <Text style={styles.navText}>‹</Text>
      </FeedbackPressable>
      {pages.map((token, index) =>
        token === 'ellipsis' ? (
          <Text key={`ellipsis-${index}`} style={styles.ellipsis}>
            …
          </Text>
        ) : (
          <FeedbackPressable
            key={token}
            accessibilityRole="button"
            onPress={() => {
              onSelectPage(token);
            }}
            style={[styles.pageBtn, token === currentPage && styles.pageBtnActive]}
          >
            <Text style={[styles.pageText, token === currentPage && styles.pageTextActive]}>
              {token}
            </Text>
          </FeedbackPressable>
        ),
      )}
      <FeedbackPressable
        accessibilityRole="button"
        disabled={atLast}
        onPress={onNext}
        style={[styles.navBtn, atLast && styles.navBtnDisabled]}
      >
        <Text style={styles.navText}>›</Text>
      </FeedbackPressable>
      <FeedbackPressable
        accessibilityRole="button"
        disabled={atLast}
        onPress={onLast}
        style={[styles.navBtn, atLast && styles.navBtnDisabled]}
      >
        <Text style={styles.navText}>»</Text>
      </FeedbackPressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    navBtn: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 4,
    },
    navBtnDisabled: {
      opacity: 0.35,
    },
    navText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    pageBtn: {
      minWidth: 28,
      paddingHorizontal: spacing.xs,
      paddingVertical: 4,
      borderRadius: 6,
      alignItems: 'center',
    },
    pageBtnActive: {
      backgroundColor: colors.accent,
    },
    pageText: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    pageTextActive: {
      color: colors.textOnAccent,
      fontWeight: '600',
    },
    ellipsis: {
      fontSize: 13,
      color: colors.textTertiary,
      paddingHorizontal: 2,
    },
  });
