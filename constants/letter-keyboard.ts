import { spacing } from '@/constants/theme';
import { TABLET_LAYOUT_MIN_WIDTH } from '@/lib/typography/font-scale';

/** Typical phone width for deriving letter-key ratios (iPhone 15 class). */
export const LETTER_KEY_REFERENCE_SCREEN_WIDTH = 390;

/** Reference key size at {@link LETTER_KEY_REFERENCE_SCREEN_WIDTH} (6-column phone layout). */
export const LETTER_KEY_REFERENCE_KEY_SIZE = 56;

/** Gameplay letter key font size (px) at reference key size. */
export const LETTER_KEY_FONT_SIZE = 28;

/** Semibold label on available keys (`LetterKeyboard`). */
export const LETTER_KEY_FONT_WEIGHT = 700;

/** Max letter keys per row on phones (tablets use fixed key size + natural wrap). */
export const LETTER_KEYBOARD_PHONE_COLUMNS = 6;

/** Horizontal padding on play screen (matches play container). */
export const LETTER_KEYBOARD_HORIZONTAL_PADDING = spacing.md * 2;

/** Use laptop-like key sizing from this width (points). */
export const LETTER_KEY_TABLET_MIN_WIDTH = TABLET_LAYOUT_MIN_WIDTH;

/** Target letter-key edge on tablets (~MacBook 1u keycap). */
export const LETTER_KEY_TABLET_MM = 15;
