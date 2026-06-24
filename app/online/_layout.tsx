import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { stackScreenOptions } from '@/constants/stack-screen-options';
import { stackHeaderSettings } from '@/lib/navigation/stack-header-options';
import { useTheme } from '@/hooks/useTheme';

/**
 * Online multiplayer flow (lobby, setup, play).
 */
export default function OnlineLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        ...stackScreenOptions,
        ...stackHeaderSettings(),
        contentStyle: { backgroundColor: colors.backgroundSecondary },
      }}
    >
      <Stack.Screen name="join" options={{ title: t('online.joinTitle') }} />
      <Stack.Screen name="browse" options={{ title: t('online.browseTitle') }} />
      <Stack.Screen name="setup" options={{ title: t('online.setupTitle') }} />
      <Stack.Screen name="pick-word/[gameId]" options={{ title: t('online.pickWordTitle') }} />
      <Stack.Screen name="lobby/[gameId]" options={{ title: t('online.lobbyTitle') }} />
      <Stack.Screen name="solo/[gameId]" options={{ headerShown: false }} />
      <Stack.Screen name="solo-results/[gameId]" options={{ title: t('game.resultsTitle') }} />
      <Stack.Screen name="play/[gameId]" options={{ headerShown: false }} />
      <Stack.Screen name="results/[gameId]" />
      <Stack.Screen name="left/[gameId]" options={{ title: t('game.leftRoundTitle') }} />
    </Stack>
  );
}
