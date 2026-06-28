import { StyleSheet, Text, View } from 'react-native';

import { type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

interface StackHeaderTitleProps {
  title: string;
  subtitle?: string;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      alignItems: 'center',
      width: '100%',
      gap: 1,
    },
    title: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
      width: '100%',
    },
    subtitle: {
      fontSize: 13,
      fontWeight: '400',
      color: colors.textSecondary,
      textAlign: 'center',
      width: '100%',
    },
  });
}

/**
 * Two-line native stack header: primary title + optional muted subtitle.
 */
export function StackHeaderTitle({ title, subtitle }: StackHeaderTitleProps) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.wrap}>
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      {subtitle ? (
        <Text numberOfLines={1} style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
