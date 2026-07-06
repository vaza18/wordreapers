import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AvatarColorPicker } from '@/components/AvatarColorPicker';
import { GenderPicker } from '@/components/GenderPicker';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTrainingMilestone } from '@/hooks/useTrainingMilestone';
import { joinErrorMessage } from '@/lib/firebase/join-error-message';
import { navigateToLocalRoomSetup, navigateToNewOnlineRoom } from '@/lib/online/create-room';
import { useProfileStore } from '@/store/profile-store';

/**
 * Guest player profile — name, gender, avatar color (M2).
 */
export default function ProfileScreen() {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const name = useProfileStore((state) => state.name);
  const gender = useProfileStore((state) => state.gender);
  const avatarColorIndex = useProfileStore((state) => state.avatarColorIndex);
  const hydrated = useProfileStore((state) => state.hydrated);
  const setName = useProfileStore((state) => state.setName);
  const setGender = useProfileStore((state) => state.setGender);
  const setAvatarColorIndex = useProfileStore((state) => state.setAvatarColorIndex);
  const saveProfile = useProfileStore((state) => state.saveProfile);
  const hydrateProfile = useProfileStore((state) => state.hydrateProfile);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { hasCompletedTrainingRound } = useTrainingMilestone();

  useEffect(() => {
    if (!hydrated) {
      void hydrateProfile();
    }
  }, [hydrateProfile, hydrated]);

  const canSave = name.trim().length >= 1;

  const handleSave = async () => {
    if (!canSave) {
      setError(t('profile.errorIncomplete'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = {
        name: name.trim(),
        gender,
        avatarColorIndex,
      };
      await saveProfile();
      if (returnTo === 'create') {
        if (hasCompletedTrainingRound) {
          navigateToNewOnlineRoom(saved);
        } else {
          navigateToLocalRoomSetup(saved);
        }
      } else if (returnTo === 'join') {
        router.replace('/online/join');
      } else if (returnTo) {
        router.replace(returnTo as never);
      } else {
        router.back();
      }
    } catch (error) {
      if (returnTo === 'create') {
        setError(joinErrorMessage(error, t));
      } else {
        setError(t('profile.errorSave'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <View style={styles.avatarBlock}>
        <PlayerAvatar name={name || '?'} avatarColorIndex={avatarColorIndex} size={56} />
        <AvatarColorPicker value={avatarColorIndex} onChange={setAvatarColorIndex} compact />
        <Text style={styles.previewHint}>{t('profile.previewHint')}</Text>
      </View>

      <Text style={styles.label}>{t('profile.name')}</Text>
      <TextInput
        autoCapitalize="words"
        autoCorrect={false}
        accessibilityLabel={t('profile.name')}
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder={t('profile.namePlaceholder')}
      />

      <Text style={styles.label}>{t('profile.gender')}</Text>
      <GenderPicker value={gender} onChange={setGender} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PrimaryButton
        label={t('profile.save')}
        disabled={!canSave || saving}
        onPress={() => {
          void handleSave();
        }}
      />
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    avatarBlock: {
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    previewHint: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: spacing.md,
    },
    label: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.borderSecondary,
      borderRadius: 8,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 16,
      color: colors.textPrimary,
      backgroundColor: colors.backgroundPrimary,
    },
    error: {
      color: '#E24B4A',
      fontSize: 14,
    },
  });
}
