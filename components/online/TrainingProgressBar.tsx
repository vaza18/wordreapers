import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { ukWordForm } from '@/lib/i18n/uk-plural';
import {
  trainingWordsRequired,
  wordsUntilTrainingUnlock,
} from '@/lib/onboarding/training-milestone';

type TrainingProgressBarProps = {
  wordCount: number;
  lexiconMax: number;
  wordsShort: string;
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xs,
      gap: spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    label: {
      fontSize: 12,
      color: colors.textSecondary,
      minWidth: 12,
    },
    track: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.controlTrack,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      backgroundColor: colors.accent,
      borderRadius: 2,
    },
    remaining: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      minWidth: 48,
      textAlign: 'right',
    },
    caption: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    captionUnlocked: {
      color: colors.accent,
      fontWeight: '600',
    },
  });
}

/**
 * Thin progress toward the training milestone (solo, before device unlock).
 */
export function TrainingProgressBar({
  wordCount,
  lexiconMax,
  wordsShort,
}: TrainingProgressBarProps) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const required = trainingWordsRequired(lexiconMax);
  const progress = required > 0 ? Math.min(1, wordCount / required) : 0;
  const remaining = wordsUntilTrainingUnlock(wordCount, lexiconMax);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>0</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.remaining}>
          {required}
          {wordsShort}
        </Text>
      </View>
      {remaining > 0 ? (
        <Text style={styles.caption}>
          {t('training.progressRemaining', {
            count: remaining,
            wordForm: ukWordForm(remaining),
          })}
        </Text>
      ) : (
        <Text style={[styles.caption, styles.captionUnlocked]}>
          {t('training.progressUnlocked')}
        </Text>
      )}
    </View>
  );
}
