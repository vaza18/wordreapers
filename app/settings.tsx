import type { ComponentType } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { CenterDialogModal } from '@/components/CenterDialogModal';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { FeedbackModePicker } from '@/components/FeedbackModePicker';
import {
  AppearanceAutoIcon,
  MoonIcon,
  SunIcon,
  type HeaderIconProps,
} from '@/components/HeaderIcons';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SettingsProfileRow } from '@/components/SettingsProfileRow';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { DEFAULT_PLAYER_PROFILE } from '@/lib/profile/player-profile';
import { clearLocalDataStorage } from '@/lib/settings/clear-local-data';
import { DEFAULT_APPEARANCE_MODE, type AppearanceMode } from '@/lib/settings/appearance-mode';
import {
  DEFAULT_BUTTON_FEEDBACK,
  DEFAULT_TIMER_ALERT_FEEDBACK,
  DEFAULT_WORD_ACCEPTED_FEEDBACK,
} from '@/lib/settings/feedback-mode';
import { DEFAULT_GAME_SETUP_PREFERENCES } from '@/lib/settings/game-setup-preferences';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { useFirebaseStore } from '@/store/firebase-store';
import { usePlayerStatsStore } from '@/store/player-stats-store';
import { useProfileStore } from '@/store/profile-store';
import { useSettingsStore } from '@/store/settings-store';

const APPEARANCE_OPTIONS: {
  value: AppearanceMode;
  labelKey: string;
  Icon: ComponentType<HeaderIconProps>;
}[] = [
  { value: 'auto', labelKey: 'settings.appearanceAuto', Icon: AppearanceAutoIcon },
  { value: 'light', labelKey: 'settings.appearanceLight', Icon: SunIcon },
  { value: 'dark', labelKey: 'settings.appearanceDark', Icon: MoonIcon },
];

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    section: {
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    note: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.textSecondary,
    },
    label: {
      color: colors.textSecondary,
      fontSize: 14,
    },
    value: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '500',
    },
    clearRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
    },
    clearLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    clearAction: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.destructiveAction,
    },
  });
}

/**
 * App settings (appearance, language, key and word feedback).
 */
export default function SettingsScreen() {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const appearanceMode = useSettingsStore((state) => state.appearanceMode);
  const buttonFeedback = useSettingsStore((state) => state.buttonFeedback);
  const wordAcceptedFeedback = useSettingsStore((state) => state.wordAcceptedFeedback);
  const timerAlertMode = useSettingsStore((state) => state.timerAlertMode);
  const setAppearanceMode = useSettingsStore((state) => state.setAppearanceMode);
  const setButtonFeedback = useSettingsStore((state) => state.setButtonFeedback);
  const setWordAcceptedFeedback = useSettingsStore((state) => state.setWordAcceptedFeedback);
  const setTimerAlertMode = useSettingsStore((state) => state.setTimerAlertMode);

  const [clearDialogVisible, setClearDialogVisible] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleClearConfirm = async () => {
    setClearing(true);
    try {
      await clearLocalDataStorage();
      useProfileStore.setState({ ...DEFAULT_PLAYER_PROFILE, hydrated: true });
      await usePlayerStatsStore.getState().resetPlayerStats();
      useSettingsStore.setState({
        locale: 'uk',
        appearanceMode: DEFAULT_APPEARANCE_MODE,
        buttonFeedback: DEFAULT_BUTTON_FEEDBACK,
        wordAcceptedFeedback: DEFAULT_WORD_ACCEPTED_FEEDBACK,
        timerAlertMode: DEFAULT_TIMER_ALERT_FEEDBACK,
        gameSetup: DEFAULT_GAME_SETUP_PREFERENCES,
      });
      useFirebaseStore.getState().setConnection({
        status: isFirebaseConfigured() ? 'idle' : 'not_configured',
        uid: null,
        errorMessage: null,
      });
      setClearDialogVisible(false);
    } finally {
      setClearing(false);
    }
  };

  return (
    <Screen>
      <View style={styles.section}>
        <SettingsProfileRow />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>{t('settings.appearance')}</Text>
        <SegmentedControl
          options={APPEARANCE_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.labelKey),
            Icon: option.Icon,
          }))}
          value={appearanceMode}
          onChange={setAppearanceMode}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>{t('settings.language')}</Text>
        <Text style={styles.value}>{t('settings.languageUk')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.feedbackSection')}</Text>
        <Text style={styles.note}>{t('settings.feedbackOsNote')}</Text>
        <FeedbackModePicker
          label={t('settings.buttonFeedback')}
          value={buttonFeedback}
          onChange={setButtonFeedback}
        />
        <FeedbackModePicker
          label={t('settings.wordAcceptedFeedback')}
          value={wordAcceptedFeedback}
          onChange={setWordAcceptedFeedback}
        />
        <FeedbackModePicker
          label={t('settings.timerAlertFeedback')}
          value={timerAlertMode}
          onChange={setTimerAlertMode}
        />
      </View>

      <View style={styles.section}>
        <FeedbackPressable
          accessibilityRole="button"
          style={styles.clearRow}
          onPress={() => {
            setClearDialogVisible(true);
          }}
        >
          <Text style={styles.clearLabel}>{t('settings.clearLocalData')}</Text>
          <Text style={styles.clearAction}>{t('settings.clearLocalDataAction')}</Text>
        </FeedbackPressable>
      </View>

      <CenterDialogModal
        visible={clearDialogVisible}
        title={t('settings.clearLocalDataConfirmTitle')}
        body={t('settings.clearLocalDataConfirmBody')}
        primaryLabel={t('settings.clearLocalDataConfirmAction')}
        onPrimary={() => {
          void handleClearConfirm();
        }}
        secondaryLabel={t('common.cancel')}
        onSecondary={() => {
          setClearDialogVisible(false);
        }}
        onRequestClose={() => {
          if (!clearing) {
            setClearDialogVisible(false);
          }
        }}
      />
    </Screen>
  );
}
