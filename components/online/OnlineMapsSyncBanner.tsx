import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

type OnlineMapsSyncBannerProps = {
  onRetry: () => void;
};

/**
 * Shared post-paint / play maps fail-loud banner (Retry over live UI).
 * Keep one copy + styles so play / results / left do not drift.
 */
export function OnlineMapsSyncBanner({ onRetry }: OnlineMapsSyncBannerProps) {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.text}>{t('online.errorMapsSyncFailed')}</Text>
      <PrimaryButton label={t('online.retryMapsSync')} onPress={onRetry} />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    banner: {
      gap: spacing.sm,
      marginHorizontal: spacing.md,
      marginTop: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: 10,
      backgroundColor: colors.backgroundPrimary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.danger,
    },
    text: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.danger,
      textAlign: 'center',
    },
  });
}
