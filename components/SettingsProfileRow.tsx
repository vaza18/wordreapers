import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useProfileStore } from '@/store/profile-store';

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    textCol: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    name: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    hint: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    chevron: {
      fontSize: 20,
      color: colors.textTertiary,
    },
  });
}

/**
 * Settings profile entry with avatar + name (mockup screens 1–2 style).
 */
export function SettingsProfileRow() {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const name = useProfileStore((state) => state.name);
  const avatarColorIndex = useProfileStore((state) => state.avatarColorIndex);
  const displayName = name.trim() || t('profile.namePlaceholder');

  return (
    <FeedbackPressable
      accessibilityRole="button"
      style={styles.row}
      onPress={() => {
        router.push('/profile');
      }}
    >
      <PlayerAvatar name={name || '?'} avatarColorIndex={avatarColorIndex} size={40} />
      <View style={styles.textCol}>
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.hint}>{t('settings.profileHint')}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </FeedbackPressable>
  );
}
