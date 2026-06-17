import { useTranslation } from 'react-i18next';

import { HeaderBarButton } from '@/components/HeaderBarButton';
import { ChevronBackIcon } from '@/components/HeaderIcons';
import { colors } from '@/constants/theme';

interface HeaderBackButtonProps {
  onPress: () => void;
  accessibilityLabel?: string;
}

/**
 * Stack header back control — same rounded-square chrome as settings.
 */
export function HeaderBackButton({ onPress, accessibilityLabel }: HeaderBackButtonProps) {
  const { t } = useTranslation();
  const label = accessibilityLabel ?? t('common.back');

  return (
    <HeaderBarButton accessibilityLabel={label} onPress={onPress}>
      <ChevronBackIcon color={colors.textPrimary} />
    </HeaderBarButton>
  );
}
