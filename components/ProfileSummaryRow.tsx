import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import {
  formatCompetitionStatsLine,
  formatTrainingStatsLine,
} from '@/lib/profile/format-profile-stats';
import { usePlayerStatsStore } from '@/store/player-stats-store';
import { useProfileStore } from '@/store/profile-store';

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
    },
    profileTap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minWidth: 0,
    },
    centerCol: {
      flex: 1,
      minWidth: 0,
      gap: 2,
      justifyContent: 'center',
    },
    statsCol: {
      gap: 2,
    },
    historySlot: {
      justifyContent: 'flex-start',
      paddingTop: 2,
      maxWidth: '36%',
    },
    name: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.textPrimary,
      flexShrink: 1,
    },
    stats: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    edit: {
      flexShrink: 0,
      fontSize: 14,
      color: colors.textTertiary,
    },
    historyLink: {
      flexShrink: 1,
      fontSize: 14,
      lineHeight: 20,
      color: colors.accent,
      textAlign: 'right',
    },
  });
}

/**
 * Home footer profile row (mockup screen 1): avatar, name, stats, edit on the right.
 */
export function ProfileSummaryRow() {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const name = useProfileStore((state) => state.name);
  const avatarColorIndex = useProfileStore((state) => state.avatarColorIndex);
  const hydrated = useProfileStore((state) => state.hydrated);
  const isComplete = useProfileStore((state) => state.isComplete());
  const competition = usePlayerStatsStore((state) => state.competition);
  const training = usePlayerStatsStore((state) => state.training);
  const statsHydrated = usePlayerStatsStore((state) => state.hydrated);
  const hydratePlayerStats = usePlayerStatsStore((state) => state.hydratePlayerStats);

  useEffect(() => {
    if (!statsHydrated) {
      void hydratePlayerStats();
    }
  }, [hydratePlayerStats, statsHydrated]);

  if (!hydrated) {
    return null;
  }

  const displayName = name.trim() || t('profile.namePlaceholder');
  const showStats = isComplete && statsHydrated;

  return (
    <View style={styles.row}>
      <FeedbackPressable
        accessibilityRole="button"
        style={styles.profileTap}
        onPress={() => {
          router.push('/profile');
        }}
      >
        <PlayerAvatar
          name={isComplete ? name : '?'}
          avatarColorIndex={avatarColorIndex}
          size={40}
        />
        <View style={styles.centerCol}>
          <Text style={styles.name}>{displayName}</Text>
          {showStats ? (
            <View style={styles.statsCol}>
              <Text style={styles.stats}>{formatCompetitionStatsLine(competition)}</Text>
              <Text style={styles.stats}>{formatTrainingStatsLine(training)}</Text>
            </View>
          ) : null}
        </View>
      </FeedbackPressable>
      {showStats ? (
        <View style={styles.historySlot}>
          <FeedbackPressable
            accessibilityRole="button"
            onPress={() => {
              router.push('/history');
            }}
          >
            <Text style={styles.historyLink}>{t('home.roundHistory')}</Text>
          </FeedbackPressable>
        </View>
      ) : (
        <FeedbackPressable
          accessibilityRole="button"
          onPress={() => {
            router.push('/profile');
          }}
        >
          <Text style={styles.edit}>{t('home.editProfile')}</Text>
        </FeedbackPressable>
      )}
    </View>
  );
}
