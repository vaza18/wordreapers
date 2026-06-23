import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { PrimaryButton } from '@/components/PrimaryButton';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { formatTimerMs } from '@/lib/game/timer-label';
import { ADD_TIME_MINUTE_OPTIONS } from '@/lib/online/add-time-vote';

interface AddTimeModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (minutes: number) => void;
  remainingMs: number;
  requiresConsensus: boolean;
}

/**
 * Pick how many minutes to add to the round timer.
 */
export function AddTimeModal({
  visible,
  onClose,
  onSelect,
  remainingMs,
  requiresConsensus,
}: AddTimeModalProps) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) {
      setSelectedMinutes(null);
    }
  }, [visible]);

  const remainingLabel = formatTimerMs(remainingMs);
  const previewToLabel = useMemo(() => {
    if (selectedMinutes == null) {
      return null;
    }
    return formatTimerMs(remainingMs + selectedMinutes * 60_000);
  }, [remainingMs, selectedMinutes]);

  const consensusLabel = requiresConsensus
    ? t('game.addTimeRequiresConsensus')
    : t('game.addTimeAppliesImmediately');

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <Text style={styles.title}>{t('game.addTimeTitle')}</Text>
      <Text style={styles.subtitle}>
        {t('game.addTimeRemaining', { time: remainingLabel })} · {consensusLabel}
      </Text>

      <View style={styles.options}>
        {ADD_TIME_MINUTE_OPTIONS.map((minutes) => {
          const selected = selectedMinutes === minutes;
          return (
            <FeedbackPressable
              key={minutes}
              accessibilityRole="button"
              onPress={() => {
                setSelectedMinutes(minutes);
              }}
              style={[
                styles.option,
                minutes === 20 ? styles.optionWide : null,
                selected ? styles.optionSelected : styles.optionIdle,
              ]}
            >
              <Text style={[styles.optionLabel, selected ? styles.optionLabelSelected : null]}>
                {t('game.addTimeMinutes', { count: minutes })}
              </Text>
            </FeedbackPressable>
          );
        })}
      </View>

      {selectedMinutes != null && previewToLabel ? (
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>
            {t(requiresConsensus ? 'game.addTimePreview' : 'game.addTimePreviewApply', {
              count: selectedMinutes,
            })}
          </Text>
          <Text style={styles.previewRange}>
            {t('game.addTimePreviewRange', { from: remainingLabel, to: previewToLabel })}
          </Text>
        </View>
      ) : null}

      <PrimaryButton
        label={requiresConsensus ? t('game.addTimePropose') : t('game.addTimeApply')}
        disabled={selectedMinutes == null}
        onPress={() => {
          if (selectedMinutes == null) {
            return;
          }
          onSelect(selectedMinutes);
          onClose();
        }}
      />
      <PrimaryButton label={t('common.cancel')} variant="secondary" onPress={onClose} />
    </BottomSheetModal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: spacing.xs,
    },
    subtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    options: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    option: {
      minWidth: 72,
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.sm,
      borderWidth: StyleSheet.hairlineWidth,
    },
    optionWide: {
      minWidth: '100%',
    },
    optionIdle: {
      backgroundColor: colors.backgroundPrimary,
      borderColor: colors.borderTertiary,
    },
    optionSelected: {
      backgroundColor: '#E1F5EE',
      borderColor: colors.accent,
      borderWidth: 1.5,
    },
    optionLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    optionLabelSelected: {
      color: '#085041',
    },
    preview: {
      backgroundColor: '#E1F5EE',
      borderRadius: radii.sm,
      padding: spacing.sm,
      marginBottom: spacing.md,
      gap: 2,
    },
    previewTitle: {
      fontSize: 13,
      fontWeight: '500',
      color: '#085041',
      textAlign: 'center',
    },
    previewRange: {
      fontSize: 13,
      color: '#085041',
      textAlign: 'center',
    },
  });
}
