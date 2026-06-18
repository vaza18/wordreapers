import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';

interface StackHeaderTitleProps {
  title: string;
  subtitle?: string;
}

/**
 * Two-line native stack header: primary title + optional muted subtitle.
 */
export function StackHeaderTitle({ title, subtitle }: StackHeaderTitleProps) {
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

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    maxWidth: 240,
    gap: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
  },
});
