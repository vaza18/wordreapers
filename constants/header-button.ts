import { StyleSheet } from 'react-native';

import { radii, type ThemeColors } from '@/constants/theme';
import { HEADER_ICON_BUTTON_SIZE } from '@/lib/ui/header-icon-button-layout';

export { HEADER_ICON_BUTTON_SIZE };

export function createHeaderIconButtonStyles(colors: ThemeColors) {
  return StyleSheet.create({
    button: {
      borderRadius: radii.sm,
      backgroundColor: colors.backgroundPrimary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    disabled: {
      opacity: 0.5,
    },
    slot: {
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
