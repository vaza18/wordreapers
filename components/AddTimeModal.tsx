import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { BottomSheetModal } from '@/components/BottomSheetModal';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, spacing } from '@/constants/theme';
import { ADD_TIME_MINUTE_OPTIONS } from '@/lib/online/add-time-vote';

interface AddTimeModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (minutes: number) => void;
}

/**
 * Organizer picks how many minutes to add to the round timer.
 */
export function AddTimeModal({ visible, onClose, onSelect }: AddTimeModalProps) {
  const { t } = useTranslation();

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <Text style={styles.title}>{t('game.addTimeTitle')}</Text>
      <View style={styles.options}>
        {ADD_TIME_MINUTE_OPTIONS.map((minutes) => (
          <PrimaryButton
            key={minutes}
            label={t('game.addTimeMinutes', { count: minutes })}
            style={styles.option}
            onPress={() => {
              onSelect(minutes);
              onClose();
            }}
          />
        ))}
      </View>
      <PrimaryButton label={t('common.cancel')} variant="secondary" onPress={onClose} />
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
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
  },
});
