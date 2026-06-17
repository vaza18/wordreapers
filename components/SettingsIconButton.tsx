import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { HeaderBarButton } from '@/components/HeaderBarButton';
import { SettingsGearIcon } from '@/components/HeaderIcons';
import { colors } from '@/constants/theme';

interface SettingsIconButtonProps {
  onPress?: () => void;
}

/**
 * Gear button — rounded-square chrome everywhere (home, stack headers, pause modal).
 */
export function SettingsIconButton({ onPress }: SettingsIconButtonProps = {}) {
  const { t } = useTranslation();

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    router.push('/settings');
  };

  return (
    <HeaderBarButton accessibilityLabel={t('nav.settings')} onPress={handlePress}>
      <SettingsGearIcon color={colors.textSecondary} />
    </HeaderBarButton>
  );
}
