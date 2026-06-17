import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/constants/stack-screen-options';
import { colors } from '@/constants/theme';

/**
 * Finished round archive list and detail.
 */
export default function HistoryLayout() {
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
