import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';

import { HeaderBarButton } from '@/components/HeaderBarButton';
import { colors } from '@/constants/theme';

interface ShuffleBaseWordButtonProps {
  onPress: () => void;
}

/**
 * Square shuffle control — same chrome as header icon buttons.
 */
export function ShuffleBaseWordButton({ onPress }: ShuffleBaseWordButtonProps) {
  const { t } = useTranslation();

  return (
    <HeaderBarButton accessibilityLabel={t('game.shuffleBaseWord')} onPress={onPress}>
      <Text style={styles.icon}>↺</Text>
    </HeaderBarButton>
  );
}

const styles = StyleSheet.create({
  icon: {
    fontSize: 20,
    lineHeight: 22,
    color: colors.textPrimary,
    textAlign: 'center',
  },
});
