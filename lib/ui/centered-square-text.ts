import type { TextStyle } from 'react-native';

/** Text style that centers a single-line glyph in a square (avatar, letter key). */
export function centeredSquareTextStyle(size: number, fontSize: number): TextStyle {
  return {
    width: size,
    height: size,
    lineHeight: size,
    fontSize,
    textAlign: 'center',
  };
}
