import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { spacing } from '@/constants/theme';

interface RoundResultsFooterActionsProps {
  primaryLabel: string;
  onPrimaryPress: () => void;
  primaryDisabled?: boolean;
  secondaryLabel: string;
  onSecondaryPress: () => void;
  /** Optional message above the button row (e.g. rematch error). */
  topContent?: ReactNode;
}

/**
 * «Грати ще» + «Головна» in one row — primary ~60% width (3:2).
 */
export function RoundResultsFooterActions({
  primaryLabel,
  onPrimaryPress,
  primaryDisabled = false,
  secondaryLabel,
  onSecondaryPress,
  topContent,
}: RoundResultsFooterActionsProps) {
  return (
    <View style={styles.wrap}>
      {topContent}
      <View style={styles.row}>
        <PrimaryButton
          label={primaryLabel}
          disabled={primaryDisabled}
          onPress={onPrimaryPress}
          style={styles.primary}
        />
        <PrimaryButton
          label={secondaryLabel}
          variant="secondary"
          onPress={onSecondaryPress}
          style={styles.secondary}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  primary: {
    flex: 3,
  },
  secondary: {
    flex: 2,
  },
});
