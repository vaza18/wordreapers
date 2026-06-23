import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getAppVersionInfo, shouldShowBuildNumber } from '@/lib/app-version';

type AppVersionLabelProps = {
  style?: StyleProp<TextStyle>;
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    label: {
      color: colors.textTertiary,
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
    },
  });
}

/** Muted version / build line for about and diagnostics screens. */
export function AppVersionLabel({ style }: AppVersionLabelProps) {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const { version, build } = getAppVersionInfo();

  if (!version && !build) {
    return null;
  }

  const label = shouldShowBuildNumber(version, build)
    ? t('app.versionWithBuild', { version, build })
    : t('app.versionOnly', { version: version ?? build });

  return <Text style={[styles.label, style]}>{label}</Text>;
}
