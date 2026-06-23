import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';

import { HeaderBarButton } from '@/components/HeaderBarButton';
import { type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

interface ShuffleBaseWordButtonProps {
  onPress: () => void;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    icon: {
      fontSize: 20,
      lineHeight: 22,
      color: colors.textPrimary,
      textAlign: 'center',
    },
  });
}

/**
 * Square shuffle control — same chrome as header icon buttons.
 */
export function ShuffleBaseWordButton({ onPress }: ShuffleBaseWordButtonProps) {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);

  return (
    <HeaderBarButton accessibilityLabel={t('game.shuffleBaseWord')} onPress={onPress}>
      <Text style={styles.icon}>↺</Text>
    </HeaderBarButton>
  );
}
