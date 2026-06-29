import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { playerAvatarColors } from '@/constants/player-avatars';
import { getAvatarInitials } from '@/lib/profile/avatar-initials';
import { computeAvatarDisplay } from '@/lib/profile/scaled-avatar-size';
import { centeredSquareTextStyle } from '@/lib/ui/centered-square-text';

interface PlayerAvatarProps {
  name: string;
  size?: number;
  /** Palette index; falls back to `playerIndex` when omitted. */
  avatarColorIndex?: number;
  /** Legacy slot index when `avatarColorIndex` is not set. */
  playerIndex?: number;
}

/**
 * Initial-based avatar circle (mockup lobby / results).
 * Glyphs and edge inset scale with capped Dynamic Type — same fill ratio as the design size.
 */
export function PlayerAvatar({
  name,
  size = 28,
  avatarColorIndex,
  playerIndex = 0,
}: PlayerAvatarProps) {
  const { width, fontScale } = useWindowDimensions();
  const colors = playerAvatarColors(avatarColorIndex ?? playerIndex);
  const initials = getAvatarInitials(name);
  const { displaySize, fontSize } = computeAvatarDisplay(size, initials, fontScale, width);

  return (
    <View
      style={[
        styles.circle,
        {
          width: displaySize,
          height: displaySize,
          borderRadius: displaySize / 2,
          backgroundColor: colors.background,
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={[
          styles.initial,
          centeredSquareTextStyle(displaySize, fontSize),
          { color: colors.color },
        ]}
      >
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    overflow: 'hidden',
  },
  initial: {
    fontWeight: '700',
  },
});
