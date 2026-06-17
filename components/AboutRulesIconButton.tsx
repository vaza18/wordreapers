import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { HeaderBarButton } from '@/components/HeaderBarButton';
import { InfoIcon } from '@/components/HeaderIcons';
import { colors } from '@/constants/theme';

/**
 * Home screen top-left: open about / rules.
 */
export function AboutRulesIconButton() {
  const { t } = useTranslation();

  return (
    <HeaderBarButton
      accessibilityLabel={t('home.aboutRules')}
      onPress={() => {
        router.push('/about');
      }}
    >
      <InfoIcon color={colors.textSecondary} />
    </HeaderBarButton>
  );
}
