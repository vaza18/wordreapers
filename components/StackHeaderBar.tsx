import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderBackButton } from '@/components/HeaderBackButton';
import { SettingsIconButton } from '@/components/SettingsIconButton';
import { headerIconButtonSize } from '@/constants/header-button';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import type { AppStackHeaderOptions } from '@/lib/navigation/stack-header-types';

const HEADER_BAR_HEIGHT = 44;

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderTertiary,
    },
    row: {
      height: HEADER_BAR_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      gap: spacing.xs,
    },
    sideSlot: {
      width: headerIconButtonSize,
      height: headerIconButtonSize,
    },
    titleSlot: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
    },
  });
}

/**
 * Custom stack header — avoids iOS 26 liquid-glass chrome around headerLeft/Right.
 */
export function StackHeaderBar({ options }: NativeStackHeaderProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const headerOptions = options as AppStackHeaderOptions;
  const showBack = headerOptions.headerBackAction != null;
  const showSettings = headerOptions.headerShowSettings ?? false;

  function renderTitle() {
    const { headerTitle, title } = options;

    if (typeof headerTitle === 'function') {
      return headerTitle({
        children: title ?? '',
        tintColor: colors.textPrimary,
      });
    }

    if (typeof headerTitle === 'string') {
      return (
        <Text numberOfLines={1} style={styles.title}>
          {headerTitle}
        </Text>
      );
    }

    if (title) {
      return (
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      );
    }

    return null;
  }

  return (
    <View
      style={[styles.root, { paddingTop: insets.top, backgroundColor: colors.backgroundSecondary }]}
    >
      <View style={styles.row}>
        {showBack ? (
          <HeaderBackButton onPress={headerOptions.headerBackAction!} />
        ) : (
          <View style={styles.sideSlot} />
        )}

        <View style={styles.titleSlot}>{renderTitle()}</View>

        {showSettings ? <SettingsIconButton /> : <View style={styles.sideSlot} />}
      </View>
    </View>
  );
}
