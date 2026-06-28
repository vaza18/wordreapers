import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { HeaderBarButton } from '@/components/HeaderBarButton';
import { InfoIcon } from '@/components/HeaderIcons';
import { useHeaderIconButtonLayout } from '@/hooks/useHeaderIconButtonLayout';
import { useTheme } from '@/hooks/useTheme';

/**
 * Home screen top-left: open about / rules.
 */
export function AboutRulesIconButton() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { infoIconSize } = useHeaderIconButtonLayout();

  return (
    <HeaderBarButton
      accessibilityLabel={t('home.aboutRules')}
      onPress={() => {
        router.push('/about');
      }}
    >
      <InfoIcon size={infoIconSize} color={colors.textSecondary} />
    </HeaderBarButton>
  );
}
