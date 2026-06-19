import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AboutRulesIconButton } from '@/components/AboutRulesIconButton';
import { LegalFooterLinks } from '@/components/LegalFooterLinks';
import { ProfileSummaryRow } from '@/components/ProfileSummaryRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SettingsIconButton } from '@/components/SettingsIconButton';
import { continueWithProfileOrRedirect } from '@/lib/online/require-profile';
import { navigateToNewOnlineRoom } from '@/lib/online/create-room';
import { joinErrorMessage } from '@/lib/firebase/join-error-message';
import { useProfileStore } from '@/store/profile-store';
import { colors, spacing } from '@/constants/theme';

const appIcon = require('../assets/icons/app-icon.png');

/**
 * Welcome / home screen (mockup screen 1).
 */
export default function HomeScreen() {
  const { t } = useTranslation();

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

      <View style={styles.hero}>
        <Image source={appIcon} style={styles.appIcon} accessibilityIgnoresInvertColors />
        <Text style={styles.brand}>Wordreapers</Text>
        <Text style={styles.appName}>{t('app.name')}</Text>
        <Text style={styles.tagline}>{t('app.tagline')}</Text>
      </View>

      <View style={styles.actions}>
        <PrimaryButton label={t('online.createGame')} onPress={handleCreateOnline} />
        <PrimaryButton label={t('nav.join')} onPress={handleJoinOnline} variant="secondary" />
      </View>

      <View style={styles.bottomSection}>
        <View style={styles.footerDivider} />
        <ProfileSummaryRow />
        <View style={[styles.footerDivider, styles.documentsDivider]} />
        <LegalFooterLinks />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  appIcon: {
    width: 96,
    height: 96,
    borderRadius: 22,
    marginBottom: spacing.sm,
  },
  brand: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.accent,
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
  actions: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
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
