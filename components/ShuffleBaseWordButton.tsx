import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';

import { HeaderBarButton } from '@/components/HeaderBarButton';
import { type ThemeColors } from '@/constants/theme';
import { useHeaderIconButtonLayout } from '@/hooks/useHeaderIconButtonLayout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { centeredSquareTextStyle } from '@/lib/ui/centered-square-text';

interface ShuffleBaseWordButtonProps {
  onPress: () => void;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    icon: {
      fontWeight: '600',
      color: colors.textPrimary,
    },
  });
}

/**
 * Square shuffle control — same chrome as header icon buttons.
 */
export function ShuffleBaseWordButton({ onPress }: ShuffleBaseWordButtonProps) {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);
  const { buttonSize, shuffleIconSize } = useHeaderIconButtonLayout();

  return (
    <HeaderBarButton accessibilityLabel={t('game.shuffleBaseWord')} onPress={onPress}>
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={[styles.icon, centeredSquareTextStyle(buttonSize, shuffleIconSize)]}
      >
        ↺
      </Text>
    </HeaderBarButton>
  );
}
