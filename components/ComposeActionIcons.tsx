import Svg, { Line, Rect } from 'react-native-svg';

export interface ComposeActionIconProps {
  size?: number;
  color: string;
}

/** Clear all letters — three tile slots with a strike-through. */
export function ClearDraftIcon({ size = 22, color }: ComposeActionIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={8} width={5} height={7} rx={1} stroke={color} strokeWidth={1.5} />
      <Rect x={9.5} y={8} width={5} height={7} rx={1} stroke={color} strokeWidth={1.5} />
      <Rect x={16} y={8} width={5} height={7} rx={1} stroke={color} strokeWidth={1.5} />
      <Line x1={2} y1={19} x2={22} y2={5} stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
