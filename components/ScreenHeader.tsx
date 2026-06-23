import { StyleSheet, Text, View } from 'react-native';

import { HeaderBackButton } from '@/components/HeaderBackButton';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  backAccessibilityLabel?: string;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      gap: spacing.xs,
    },
    backSpacer: {
      width: 40,
    },
    title: {
      flex: 1,
      fontSize: 22,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
    },
  });
}

/**
 * Title row with optional back arrow (setup and stacked screens).
 */
export function ScreenHeader({ title, onBack, backAccessibilityLabel }: ScreenHeaderProps) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.row}>
      {onBack ? (
        <HeaderBackButton onPress={onBack} accessibilityLabel={backAccessibilityLabel} />
      ) : (
        <View style={styles.backSpacer} />
      )}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.backSpacer} />
    </View>
  );
}
