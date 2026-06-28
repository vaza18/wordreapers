import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AboutRulesIconButton } from '@/components/AboutRulesIconButton';
import { LegalFooterLinks } from '@/components/LegalFooterLinks';
import { ProfileSummaryRow } from '@/components/ProfileSummaryRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SettingsIconButton } from '@/components/SettingsIconButton';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useTrainingMilestone } from '@/hooks/useTrainingMilestone';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { joinErrorMessage } from '@/lib/firebase/join-error-message';
import { navigateToNewOnlineRoom } from '@/lib/online/create-room';
import { continueWithProfileOrRedirect } from '@/lib/online/require-profile';
import { useProfileStore } from '@/store/profile-store';

const appIcon = require('../assets/icons/app-icon.png');

/**
 * Welcome / home screen (mockup screen 1).
 */
export default function HomeScreen() {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const { hydrated: trainingHydrated, hasCompletedTrainingRound } = useTrainingMilestone();
  const joinLocked = trainingHydrated && !hasCompletedTrainingRound;

  const handleCreateOnline = () => {
    if (!continueWithProfileOrRedirect('create')) {
      return;
    }
    const { name, gender, avatarColorIndex } = useProfileStore.getState();
    void navigateToNewOnlineRoom({ name, gender, avatarColorIndex }).catch((error) => {
      Alert.alert(t('app.name'), joinErrorMessage(error, t));
    });
  };

  const handleJoinOnline = () => {
    if (joinLocked) {
      Alert.alert(t('app.name'), t('nav.joinLockedHint'));
      return;
    }
    if (!continueWithProfileOrRedirect('join')) {
      return;
    }
    router.push('/online/join');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <AboutRulesIconButton />
        <SettingsIconButton />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Image source={appIcon} style={styles.appIcon} accessibilityIgnoresInvertColors />
          <Text style={styles.brand}>Wordreapers</Text>
          <Text style={styles.appName}>{t('app.name')}</Text>
          <Text style={styles.tagline}>{t('app.tagline')}</Text>
        </View>

        <View style={styles.actions}>
          <PrimaryButton label={t('nav.newGame')} onPress={handleCreateOnline} />
          <Text style={styles.description}>{t('nav.newGameDescription')}</Text>
          <PrimaryButton
            label={t('nav.join')}
            onPress={handleJoinOnline}
            variant="secondary"
            disabled={joinLocked}
          />
          <Text style={styles.description}>
            {joinLocked ? t('nav.joinLockedDescription') : t('nav.joinDescription')}
          </Text>
        </View>

        <View style={styles.bottomSection}>
          <View style={styles.footerDivider} />
          <ProfileSummaryRow />
          <View style={[styles.footerDivider, styles.documentsDivider]} />
          <LegalFooterLinks />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
    },
    scrollContent: {
      flexGrow: 1,
      paddingBottom: spacing.sm,
    },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
    },
    hero: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      gap: spacing.xs,
      minHeight: 160,
    },
    appIcon: {
      width: 64,
      height: 64,
      borderRadius: 16,
      marginBottom: spacing.sm,
    },
    brand: {
      fontSize: 28,
      fontWeight: '600',
      color: colors.accent,
      textAlign: 'center',
    },
    appName: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    tagline: {
      fontSize: 16,
      color: colors.textSecondary,
      lineHeight: 22,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    description: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
      marginBottom: spacing.md,
      textAlign: 'center',
    },
    actions: {
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      flexShrink: 0,
    },
    bottomSection: {
      paddingTop: spacing.sm,
    },
    footerDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSecondary,
      marginHorizontal: spacing.md,
    },
    documentsDivider: {
      marginTop: spacing.md,
    },
  });
}
