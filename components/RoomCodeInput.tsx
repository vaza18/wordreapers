import { useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';
import { normalizeRoomCode } from '@/lib/firebase/room-code';

const CODE_LENGTH = 4;

interface RoomCodeInputProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Four-cell room code entry (mockup screen 8).
 */
export function RoomCodeInput({ value, onChange }: RoomCodeInputProps) {
  const inputRef = useRef<TextInput>(null);
  const normalized = normalizeRoomCode(value).slice(0, CODE_LENGTH);
  const cells = Array.from({ length: CODE_LENGTH }, (_, index) => normalized[index] ?? '');

  return (
    <View style={styles.wrap}>
      <TextInput
        ref={inputRef}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={CODE_LENGTH}
        value={normalized}
        onChangeText={(text) => {
          onChange(normalizeRoomCode(text));
        }}
        style={styles.hiddenInput}
        accessibilityLabel="Room code"
      />
      <View style={styles.row}>
        {cells.map((char, index) => (
          <Pressable
            key={index}
            style={[styles.cell, char ? styles.cellFilled : null]}
            onPress={() => inputRef.current?.focus()}
          >
            <Text style={styles.cellText}>{char}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cell: {
    width: 44,
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.borderSecondary,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundPrimary,
  },
  cellFilled: {
    borderColor: colors.accent,
  },
  cellText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.accent,
  },
});
