import { memo } from 'react';
import { Animated, type StyleProp, type TextStyle } from 'react-native';

export interface DraftLetterFlyOverlayProps {
  flyLetter: string;
  flyPosition: Animated.ValueXY;
  flyScale: Animated.Value;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  style: StyleProp<TextStyle>;
}

/**
 * Ghost letter during key-to-draft fly — isolated from draft text re-renders.
 * Host is Animated.View: pointerEvents on Text is ignored on Android, so a
 * flying glyph would steal taps from keys underneath.
 */
export const DraftLetterFlyOverlay = memo(function DraftLetterFlyOverlay({
  flyLetter,
  flyPosition,
  flyScale,
  fontSize,
  lineHeight,
  letterSpacing,
  style,
}: DraftLetterFlyOverlayProps) {
  return (
    // FIX: 2026-09 — fly glyph blocked key taps → pointerEvents on Text ignored on Android
    <Animated.View
      pointerEvents="none"
      importantForAccessibility="no"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        transformOrigin: 'left center',
        transform: [...flyPosition.getTranslateTransform(), { scale: flyScale }],
      }}
    >
      <Animated.Text
        allowFontScaling={false}
        importantForAccessibility="no"
        style={[
          style,
          {
            fontSize,
            lineHeight,
            height: lineHeight,
            letterSpacing,
          },
        ]}
      >
        {flyLetter}
      </Animated.Text>
    </Animated.View>
  );
});
