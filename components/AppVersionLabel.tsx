import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getAppVersionInfo, shouldShowBuildNumber } from '@/lib/app-version';
import { useRtdbDiagnosticsStore } from '@/store/rtdb-diagnostics-store';
import { useToastStore } from '@/store/toast-store';

type AppVersionLabelProps = {
  style?: StyleProp<ViewStyle>;
};

const TAP_TIMEOUT_MS = 500;
const REQUIRED_TAPS = 7;

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    pressable: {
      alignSelf: 'center',
      padding: 8,
    },
    label: {
      color: colors.textTertiary,
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
    },
  });
}

/**
 * Muted version / build line for about and diagnostics screens.
 *  Includes a hidden 7-tap gesture to toggle developer mode.
 */
export function AppVersionLabel({ style }: AppVersionLabelProps) {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const { version, build } = getAppVersionInfo();

  const tapCountRef = useRef(0);
  const lastTapRef = useRef(0);
  const developerModeEnabled = useRtdbDiagnosticsStore((state) => state.developerModeEnabled);
  const setDeveloperModeEnabled = useRtdbDiagnosticsStore((state) => state.setDeveloperModeEnabled);
  const enqueueToast = useToastStore((state) => state.enqueueToast);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current > TAP_TIMEOUT_MS) {
      tapCountRef.current = 1;
    } else {
      tapCountRef.current += 1;
    }
    lastTapRef.current = now;

    if (tapCountRef.current >= REQUIRED_TAPS) {
      const next = !developerModeEnabled;
      setDeveloperModeEnabled(next);
      tapCountRef.current = 0;
      enqueueToast(
        next ? t('settings.developerMode.enabled') : t('settings.developerMode.disabled'),
        next ? 'success' : 'default',
      );
    }
  }, [developerModeEnabled, setDeveloperModeEnabled, enqueueToast, t]);

  if (!version && !build) {
    return null;
  }

  const label = shouldShowBuildNumber(version, build)
    ? t('app.versionWithBuild', { version, build })
    : t('app.versionOnly', { version: version ?? build });

  return (
    <Pressable onPress={handleTap} style={[styles.pressable, style]}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}
