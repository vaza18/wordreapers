import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { createElement } from 'react';

import { StackHeaderBar } from '@/components/StackHeaderBar';

/** Shared stack header (custom bar — no iOS liquid-glass button chrome). */
export const stackScreenOptions: NativeStackNavigationOptions = {
  header: (props: Parameters<NonNullable<NativeStackNavigationOptions['header']>>[0]) =>
    createElement(StackHeaderBar, props),
  headerShadowVisible: false,
  headerBackTitle: '',
  headerLargeTitle: false,
  headerBackButtonDisplayMode: 'minimal',
};
