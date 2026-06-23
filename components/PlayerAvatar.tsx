import { StyleSheet, Text, View } from 'react-native';

import { playerAvatarColors } from '@/constants/player-avatars';
import { getAvatarInitials } from '@/lib/profile/avatar-initials';

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
 */
export function PlayerAvatar({
  name,
  size = 28,
  avatarColorIndex,
  playerIndex = 0,
}: PlayerAvatarProps) {
  const colors = playerAvatarColors(avatarColorIndex ?? playerIndex);
  const initials = getAvatarInitials(name);
  const fontSize = initials.length > 1 ? size * 0.36 : size * 0.45;

  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.background,
        },
      ]}
    >
      <Text style={[styles.initial, { color: colors.color, fontSize }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontWeight: '600',
  },
});
