import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, type ThemeColors } from '@/constants/theme';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { useThemedStyles } from '@/hooks/useThemedStyles';

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    banner: {
      backgroundColor: colors.warningBg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSecondary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    text: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.warningText,
      textAlign: 'center',
    },
  });
}

/**
 * Global banner when device or Firebase RTDB is disconnected.
 */
export function ConnectivityBanner() {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { isOnline, deviceConnected, rtdbConnected } = useConnectivity();

  if (isOnline) {
    return null;
  }

  const message = !deviceConnected
    ? t('online.offlineBanner')
    : !rtdbConnected
      ? t('online.reconnectingBanner')
      : t('online.offlineBanner');

  return (
    <View style={[styles.banner, { paddingTop: insets.top + spacing.xs }]}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}
