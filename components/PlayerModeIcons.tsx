import Svg, { Circle, Path } from 'react-native-svg';

interface PlayerModeIconProps {
  size?: number;
  color: string;
}

/** Single player — solo mode. */
export function SoloPlayerIcon({ size = 28, color }: PlayerModeIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={3.5} stroke={color} strokeWidth={1.75} />
      <Path
        d="M6 20v-1.5a6 6 0 0 1 12 0V20"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Two players — invite others / multiplayer. */
export function GroupPlayersIcon({ size = 28, color }: PlayerModeIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={8} r={3} stroke={color} strokeWidth={1.75} />
      <Path
        d="M3.5 20v-1.2a5 5 0 0 1 5-4.3"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <Circle cx={17} cy={9} r={2.5} stroke={color} strokeWidth={1.75} />
      <Path
        d="M14.5 20v-1a4 4 0 0 1 4-3.5"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  );
}
