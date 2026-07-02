import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { PrimaryButton } from '@/components/PrimaryButton';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { ukWordForm } from '@/lib/i18n/uk-plural';
import { wordsUntilTrainingUnlock } from '@/lib/onboarding/training-milestone';

type PlayStatsExplainModalProps = {
  visible: boolean;
  wordCount: number;
  maxWordCount: number | null;
  showTrainingUnlockHint: boolean;
  onClose: () => void;
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textSecondary,
      marginBottom: spacing.md,
    },
    trainingHint: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textPrimary,
      marginBottom: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderTertiary,
    },
  });
}

/**
 * Explains compact play stats (found/max words) during solo training.
 */
export function PlayStatsExplainModal({
  visible,
  wordCount,
  maxWordCount,
  showTrainingUnlockHint,
  onClose,
}: PlayStatsExplainModalProps) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const max = maxWordCount ?? 0;
  const foundForm = ukWordForm(wordCount);
  const maxForm = ukWordForm(max);
  const remaining = wordsUntilTrainingUnlock(wordCount, max);
  const remainingForm = ukWordForm(remaining);

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <Text style={styles.title}>{t('game.statsExplainTitle')}</Text>
      <Text style={styles.body}>
        {t('game.statsExplainFound', { found: wordCount, foundForm, max, maxForm })}
      </Text>
      {showTrainingUnlockHint && remaining > 0 ? (
        <Text style={styles.trainingHint}>
          {t('training.unlockRemaining', { count: remaining, wordForm: remainingForm })}
        </Text>
      ) : null}
      <PrimaryButton label={t('common.close')} variant="secondary" onPress={onClose} />
    </BottomSheetModal>
  );
}
