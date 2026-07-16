import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { DEFAULT_CODE_LENGTH, normalizeRoomCode } from '@/lib/firebase/room-code';

interface RoomCodeJoinAction {
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

interface RoomCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  joinAction?: RoomCodeJoinAction;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
    cellDisabled: {
      opacity: 0.5,
    },
    cellText: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.accent,
    },
    joinCell: {
      width: 44,
      height: 48,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    joinCellPrimary: {
      backgroundColor: colors.accent,
    },
    joinCellSecondary: {
      backgroundColor: colors.backgroundPrimary,
      borderWidth: 1.5,
      borderColor: colors.borderSecondary,
    },
    joinCellDisabled: {
      opacity: 0.5,
    },
    joinCellLabel: {
      fontSize: 22,
      fontWeight: '600',
      color: colors.textOnAccent,
    },
    joinCellLabelSecondary: {
      color: colors.textPrimary,
    },
  });
}

/**
 * Room code entry (mockup screen 8). Default length is {@link DEFAULT_CODE_LENGTH}.
 */
export function RoomCodeInput({
  value,
  onChange,
  disabled = false,
  joinAction,
}: RoomCodeInputProps) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);
  const normalized = normalizeRoomCode(value).slice(0, DEFAULT_CODE_LENGTH);
  const cells = Array.from({ length: DEFAULT_CODE_LENGTH }, (_, index) => normalized[index] ?? '');

  return (
    <View style={styles.wrap}>
      <TextInput
        ref={inputRef}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={DEFAULT_CODE_LENGTH}
        value={normalized}
        editable={!disabled}
        onChangeText={(text) => {
          onChange(normalizeRoomCode(text));
        }}
        style={styles.hiddenInput}
        accessibilityLabel={t('online.roomCodeAccessibility')}
      />
      <View style={styles.row}>
        {cells.map((char, index) => (
          <Pressable
            key={index}
            disabled={disabled}
            style={[
              styles.cell,
              char ? styles.cellFilled : null,
              disabled ? styles.cellDisabled : null,
            ]}
            onPress={() => inputRef.current?.focus()}
          >
            <Text style={styles.cellText}>{char}</Text>
          </Pressable>
        ))}
        {joinAction ? (
          <FeedbackPressable
            accessibilityRole="button"
            accessibilityLabel={joinAction.accessibilityLabel}
            disabled={disabled || joinAction.disabled}
            onPress={joinAction.onPress}
            style={[
              styles.joinCell,
              joinAction.variant === 'secondary'
                ? styles.joinCellSecondary
                : styles.joinCellPrimary,
              disabled || joinAction.disabled ? styles.joinCellDisabled : null,
            ]}
          >
            <Text
              style={[
                styles.joinCellLabel,
                joinAction.variant === 'secondary' ? styles.joinCellLabelSecondary : null,
              ]}
            >
              →
            </Text>
          </FeedbackPressable>
        ) : null}
      </View>
    </View>
  );
}
