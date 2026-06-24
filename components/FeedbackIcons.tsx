import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { HeaderIconProps } from '@/components/HeaderIcons';

/** No haptic or sound feedback. */
export function FeedbackNoneIcon({ size = 20, color }: HeaderIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.75} />
      <Path d="M8 8l8 8" stroke={color} strokeWidth={1.75} strokeLinecap="round" />
    </Svg>
  );
}

/** Vibration-only feedback. */
export function FeedbackVibrationIcon({ size = 20, color }: HeaderIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={9} y={4} width={6} height={16} rx={1.5} stroke={color} strokeWidth={1.75} />
      <Path
        d="M5 9v6M3 11v2M19 8v8M21 10.5v3"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Sound-only feedback. */
export function FeedbackSoundIcon({ size = 20, color }: HeaderIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11 5 6 9H4v6h2l5 4V5Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8 8 0 0 1 0 12"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Sound and vibration feedback. */
export function FeedbackBothIcon({ size = 20, color }: HeaderIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 9v6M2 11v2" stroke={color} strokeWidth={1.75} strokeLinecap="round" />
      <Path
        d="M9 6 6 9H5v6h1l3 3V6Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M13 8.5a4 4 0 0 1 0 7M15.5 6.5a7 7 0 0 1 0 11"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <Path d="M20 9v6M22 11v2" stroke={color} strokeWidth={1.75} strokeLinecap="round" />
    </Svg>
  );
}
