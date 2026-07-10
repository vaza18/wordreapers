import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { I18nextProvider } from 'react-i18next';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { VictoryConfettiHost } from '@/components/VictoryConfetti';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { stackScreenOptions } from '@/constants/stack-screen-options';
import {
  stackHeaderBack,
  stackHeaderWithBackAndSettings,
} from '@/lib/navigation/stack-header-options';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import i18n, { initI18n } from '@/i18n';
import { LOCAL_BOOTSTRAP_TIMEOUT_MS, withBootstrapTimeout } from '@/lib/app/bootstrap-timeout';
import { warmUpFeedbackModules } from '@/lib/feedback/game-feedback';
import { enableAccessibleTypography } from '@/lib/typography/enable-accessible-typography';
import { subscribeImmersiveStatusBar } from '@/lib/system-ui';

enableAccessibleTypography();
import { useRoundFinishedNotificationRouting } from '@/hooks/useRoundFinishedNotificationRouting';
import { useOnlineSyncCoordinator } from '@/hooks/useOnlineSyncCoordinator';
import { purgeStaleActiveRoundCaches } from '@/lib/online/session/cache-active-round';
import { usePlayerStatsStore } from '@/store/player-stats-store';
import { useProfileStore } from '@/store/profile-store';
import { useSettingsStore } from '@/store/settings-store';

function BootstrapLoading() {
  const { colors } = useTheme();

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.backgroundSecondary,
        gap: spacing.md,
      }}
    >
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={{ fontSize: 15, color: colors.textSecondary }}>{i18n.t('app.loading')}</Text>
    </View>
  );
}

function RootStack() {
  const { colors } = useTheme();

  return (
    <I18nextProvider i18n={i18n}>
      <StatusBar hidden />
      <Stack
        screenOptions={{
          ...stackScreenOptions,
          contentStyle: { backgroundColor: colors.backgroundSecondary },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="profile"
          options={{
            title: i18n.t('profile.title'),
            ...stackHeaderBack(() => {
              router.back();
            }),
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            title: i18n.t('settings.title'),
            ...stackHeaderBack(() => {
              router.back();
            }),
          }}
        />
        <Stack.Screen name="online" options={{ headerShown: false }} />
        <Stack.Screen name="history" options={{ headerShown: false }} />
        <Stack.Screen
          name="about"
          options={{
            title: i18n.t('home.aboutRules'),
            ...stackHeaderWithBackAndSettings(() => {
              router.back();
            }),
          }}
        />
        <Stack.Screen
          name="privacy"
          options={{
            title: i18n.t('home.privacy'),
            ...stackHeaderWithBackAndSettings(() => {
              router.back();
            }),
          }}
        />
        <Stack.Screen
          name="terms"
          options={{
            title: i18n.t('home.terms'),
            ...stackHeaderWithBackAndSettings(() => {
              router.back();
            }),
          }}
        />
        <Stack.Screen
          name="opensource"
          options={{
            title: i18n.t('home.openSource'),
            ...stackHeaderWithBackAndSettings(() => {
              router.back();
            }),
          }}
        />
      </Stack>
      <VictoryConfettiHost />
    </I18nextProvider>
  );
}

/**
 * Root navigation stack and global providers.
 */
export default function RootLayout() {
  const [ready, setReady] = useState(false);
  useRoundFinishedNotificationRouting(ready);
  useOnlineSyncCoordinator(ready);
  const setLocale = useSettingsStore((state) => state.setLocale);
  const hydrateAppearancePreference = useSettingsStore(
    (state) => state.hydrateAppearancePreference,
  );
  const hydrateFeedbackPreferences = useSettingsStore((state) => state.hydrateFeedbackPreferences);
  const hydrateVisualEffectsPreferences = useSettingsStore(
    (state) => state.hydrateVisualEffectsPreferences,
  );
  const hydrateGameSetupPreferences = useSettingsStore(
    (state) => state.hydrateGameSetupPreferences,
  );
  const hydrateProfile = useProfileStore((state) => state.hydrateProfile);
  const hydratePlayerStats = usePlayerStatsStore((state) => state.hydratePlayerStats);

  useEffect(() => {
    void (async () => {
      try {
        const instance = await withBootstrapTimeout(
          initI18n(),
          LOCAL_BOOTSTRAP_TIMEOUT_MS,
          'initI18n',
        );
        if (instance) {
          setLocale(instance.language as 'uk');
        }

        await Promise.all([
          withBootstrapTimeout(
            hydrateAppearancePreference(),
            LOCAL_BOOTSTRAP_TIMEOUT_MS,
            'appearance',
          ),
          withBootstrapTimeout(
            hydrateFeedbackPreferences(),
            LOCAL_BOOTSTRAP_TIMEOUT_MS,
            'feedback',
          ),
          withBootstrapTimeout(
            hydrateVisualEffectsPreferences(),
            LOCAL_BOOTSTRAP_TIMEOUT_MS,
            'visualEffects',
          ),
          withBootstrapTimeout(
            hydrateGameSetupPreferences(),
            LOCAL_BOOTSTRAP_TIMEOUT_MS,
            'gameSetup',
          ),
          withBootstrapTimeout(hydrateProfile(), LOCAL_BOOTSTRAP_TIMEOUT_MS, 'profile'),
          withBootstrapTimeout(hydratePlayerStats(), LOCAL_BOOTSTRAP_TIMEOUT_MS, 'playerStats'),
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (__DEV__) {
          console.warn('App bootstrap failed:', message);
        }
      } finally {
        setReady(true);
      }

      void withBootstrapTimeout(
        purgeStaleActiveRoundCaches(),
        LOCAL_BOOTSTRAP_TIMEOUT_MS,
        'purgeCaches',
      );
    })();
  }, [
    hydrateAppearancePreference,
    hydrateFeedbackPreferences,
    hydrateVisualEffectsPreferences,
    hydrateGameSetupPreferences,
    hydrateProfile,
    hydratePlayerStats,
    setLocale,
  ]);

  useEffect(() => {
    warmUpFeedbackModules();
    return subscribeImmersiveStatusBar();
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>{ready ? <RootStack /> : <BootstrapLoading />}</ThemeProvider>
    </SafeAreaProvider>
  );
}
