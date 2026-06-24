import { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

/** Default: no top inset — stack headers already reserve the status-bar area. */
const DEFAULT_SAFE_AREA_EDGES: Edge[] = ['left', 'right', 'bottom'];

interface ScreenProps {
  title?: string;
  children: ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
  safeAreaEdges?: Edge[];
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
    },
    title: {
      fontSize: 22,
      fontWeight: '600',
      color: colors.textPrimary,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    content: {
      padding: spacing.md,
      gap: spacing.md,
    },
    contentStatic: {
      flex: 1,
    },
  });
}

/**
 * Base screen layout with safe area and optional title.
 */
export function Screen({
  title,
  children,
  scroll = true,
  style,
  keyboardShouldPersistTaps,
  safeAreaEdges = DEFAULT_SAFE_AREA_EDGES,
}: ScreenProps) {
  const styles = useThemedStyles(createStyles);

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, style]}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.contentStatic, style]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={safeAreaEdges}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {body}
    </SafeAreaView>
  );
}
