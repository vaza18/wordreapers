import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { spacing, type ThemeColors } from '@/constants/theme';
import type { SetupPlayableLexiconHintStatus } from '@/hooks/useSetupPlayableLexiconHint';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

/** Match hint paragraph line height so loading/ready/empty share the same block height. */
const HINT_LINE_HEIGHT = 16;
const SPINNER_SLOT = HINT_LINE_HEIGHT;

export interface PlayableWordsCountHintProps {
  status: SetupPlayableLexiconHintStatus;
  maxCount: number | null;
}

/**
 * Lexicon size hint for base-word setup / pick-word screens.
 */
export function PlayableWordsCountHint({ status, maxCount }: PlayableWordsCountHintProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  let content: ReactNode = null;
  if (status === 'empty' || status === 'tooShort') {
    content = <Text style={styles.hintText}>{t('game.playableWordsNeedBaseWord')}</Text>;
  } else if (status === 'loading') {
    content = (
      <View style={styles.loadingRow}>
        <View style={styles.spinnerSlot}>
          <ActivityIndicator color={colors.accent} size="small" style={styles.spinner} />
        </View>
        <Text style={styles.hintText}>{t('game.playableWordsLoading')}</Text>
      </View>
    );
  } else if (status === 'ready' && maxCount != null) {
    content = (
      <Text style={styles.hintText}>{t('online.playableWordsMax', { count: maxCount })}</Text>
    );
  }

  if (!content) {
    return null;
  }

  return <View style={styles.container}>{content}</View>;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      minHeight: HINT_LINE_HEIGHT,
      justifyContent: 'center',
    },
    hintText: {
      fontSize: 12,
      lineHeight: HINT_LINE_HEIGHT,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      minHeight: HINT_LINE_HEIGHT,
    },
    spinnerSlot: {
      width: SPINNER_SLOT,
      height: SPINNER_SLOT,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    spinner: {
      transform: [{ scale: 0.65 }],
    },
  });
}
