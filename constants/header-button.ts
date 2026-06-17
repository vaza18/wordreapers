import { StyleSheet } from 'react-native';

import { colors, radii } from '@/constants/theme';

/** Shared 40×40 rounded-square chrome for header icon buttons. */
export const headerIconButtonSize = 40;

export const headerIconButtonStyles = StyleSheet.create({
  button: {
    width: headerIconButtonSize,
    height: headerIconButtonSize,
    borderRadius: radii.sm,
    backgroundColor: colors.backgroundPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slot: {
    width: headerIconButtonSize,
    height: headerIconButtonSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
