import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/constants/stack-screen-options';
import { useTheme } from '@/hooks/useTheme';

/**
 * Finished round archive list and detail.
 */
export default function HistoryLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        ...stackScreenOptions,
        contentStyle: { backgroundColor: colors.backgroundSecondary },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[archiveKey]" />
    </Stack>
  );
}
