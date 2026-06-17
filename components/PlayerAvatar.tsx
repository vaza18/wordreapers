import { StyleSheet, Text, View } from 'react-native';

import { playerAvatarColors } from '@/constants/player-avatars';

interface PlayerAvatarProps {
  name: string;
  size?: number;
  /** Palette index 0–5; falls back to `playerIndex` when omitted. */
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
  const initial = name.trim().charAt(0).toLocaleUpperCase('uk-UA') || '?';

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
      <Text style={[styles.initial, { color: colors.color, fontSize: size * 0.45 }]}>
        {initial}
      </Text>
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
