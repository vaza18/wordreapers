import { useTranslation } from 'react-i18next';

import { SegmentedControl } from '@/components/SegmentedControl';
import type { PlayerGender } from '@/lib/game/grammar';

interface GenderPickerProps {
  value: PlayerGender;
  onChange: (value: PlayerGender) => void;
}

/**
 * Female / male / middle (neuter) gender for Ukrainian UI agreement.
 */
export function GenderPicker({ value, onChange }: GenderPickerProps) {
  const { t } = useTranslation();

  return (
    <SegmentedControl
      value={value ?? 'n'}
      onChange={(next) => {
        onChange(next === 'n' ? null : next);
      }}
      options={[
        { value: 'f', label: t('profile.genderFemale') },
        { value: 'm', label: t('profile.genderMale') },
        { value: 'n', label: t('profile.genderNeutral') },
      ]}
    />
  );
}
