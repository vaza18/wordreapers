import type { ThemeColors } from '@/constants/theme';

/** Dimmed backdrop behind modals and bottom sheets. */
export function modalOverlayBackground(colors: ThemeColors): string {
  return colors.modalOverlay;
}

/** Centered dialog card — elevated surface with a full border. */
export function modalCardChrome(colors: ThemeColors) {
  return {
    backgroundColor: colors.modalSurface,
    borderColor: colors.modalBorder,
    borderWidth: 1,
  } as const;
}

/** Bottom sheet — elevated surface with top and side edges only. */
export function modalSheetChrome(colors: ThemeColors) {
  return {
    backgroundColor: colors.modalSurface,
    borderColor: colors.modalBorder,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  } as const;
}
