import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { DurationSlider } from '@/components/DurationSlider';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { InfoIcon } from '@/components/HeaderIcons';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SettingSwitch } from '@/components/SettingSwitch';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { modalCardChrome, modalOverlayBackground } from '@/lib/ui/modal-chrome';
import type { UniqueBonusMode } from '@/lib/game/scoring';

export interface RoundSettingsFieldsProps {
  durationMinutes: number;
  onDurationChange: (minutes: number) => void;
  uniqueBonusMode: UniqueBonusMode;
  onUniqueBonusModeChange: (mode: UniqueBonusMode) => void;
  allowProperNouns: boolean;
  onAllowProperNounsChange: (value: boolean) => void;
  allowSlang: boolean;
  onAllowSlangChange: (value: boolean) => void;
}

/**
 * Shared round options: duration, unique bonus, proper nouns, slang.
 */
export function RoundSettingsFields({
  durationMinutes,
  onDurationChange,
  uniqueBonusMode,
  onUniqueBonusModeChange,
  allowProperNouns,
  onAllowProperNounsChange,
  allowSlang,
  onAllowSlangChange,
}: RoundSettingsFieldsProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [showUniqueBonusHint, setShowUniqueBonusHint] = useState(false);

  return (
    <>
      <DurationSlider
        label={t('game.duration')}
        value={durationMinutes}
        valueSuffix={t('game.minutesShort')}
        onChange={onDurationChange}
      />

      <View style={styles.uniqueBonusHeader}>
        <Text style={styles.sectionLabel}>{t('game.uniqueBonus')}</Text>
        <FeedbackPressable
          accessibilityRole="button"
          accessibilityLabel={t('game.uniqueBonusHintTitle')}
          onPress={() => setShowUniqueBonusHint(true)}
          style={styles.infoButton}
        >
          <InfoIcon size={16} color={colors.accent} />
        </FeedbackPressable>
      </View>
      <SegmentedControl
        value={uniqueBonusMode}
        onChange={onUniqueBonusModeChange}
        options={[
          { value: 'auto', label: t('game.uniqueBonusAuto') },
          { value: 'off', label: t('game.uniqueBonusOff') },
        ]}
      />

      <SettingSwitch
        label={t('game.allowProperNouns')}
        hint={t('game.allowProperNounsHint')}
        value={allowProperNouns}
        onChange={onAllowProperNounsChange}
      />
      <SettingSwitch
        label={t('game.allowSlang')}
        hint={t('game.allowSlangHint')}
        value={allowSlang}
        onChange={onAllowSlangChange}
      />

      <Modal transparent visible={showUniqueBonusHint} animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowUniqueBonusHint(false)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.modalTitle}>{t('game.uniqueBonusHintTitle')}</Text>
            <Text style={styles.modalBody}>{t('game.uniqueBonusHintBody')}</Text>
            <PrimaryButton
              label={t('game.uniqueBonusHintClose')}
              onPress={() => setShowUniqueBonusHint(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    sectionLabel: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    uniqueBonusHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    infoButton: {
      padding: spacing.xs,
    },
    modalOverlay: {
      flex: 1,
      justifyContent: 'center',
      padding: spacing.lg,
      backgroundColor: modalOverlayBackground(colors),
    },
    modalCard: {
      ...modalCardChrome(colors),
      borderRadius: radii.md,
      padding: spacing.lg,
      gap: spacing.md,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    modalBody: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
    },
  });
}
