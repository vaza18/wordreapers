import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { ConditionalModal } from '@/lib/ui/conditional-modal';

interface CenterDialogModalProps {
  visible: boolean;
  title: string;
  body?: string;
  children?: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onRequestClose?: () => void;
  /** When false, backdrop tap and Android back do not close the dialog. */
  dismissOnBackdrop?: boolean;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      padding: spacing.lg,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    card: {
      backgroundColor: colors.backgroundPrimary,
      borderRadius: radii.md,
      padding: spacing.lg,
      gap: spacing.md,
      alignItems: 'stretch',
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    actions: {
      gap: spacing.sm,
    },
  });
}

/**
 * Centered in-app dialog (same family as time-up / game menu cards).
 */
export function CenterDialogModal({
  visible,
  title,
  body,
  children,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  onRequestClose,
  dismissOnBackdrop = true,
}: CenterDialogModalProps) {
  const styles = useThemedStyles(createStyles);
  const close = onRequestClose ?? onSecondary ?? onPrimary;
  const canDismissOnBackdrop = dismissOnBackdrop;

  const card = (
    <View style={styles.card} onStartShouldSetResponder={() => true}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {children}
      <View style={styles.actions}>
        {secondaryLabel && onSecondary ? (
          <PrimaryButton label={secondaryLabel} variant="secondary" onPress={onSecondary} />
        ) : null}
        <PrimaryButton label={primaryLabel} onPress={onPrimary} />
      </View>
    </View>
  );

  return (
    <ConditionalModal
      transparent
      visible={visible}
      onRequestClose={canDismissOnBackdrop ? close : () => {}}
    >
      {canDismissOnBackdrop ? (
        <Pressable accessibilityRole="button" style={styles.overlay} onPress={close}>
          {card}
        </Pressable>
      ) : (
        <View style={styles.overlay}>{card}</View>
      )}
    </ConditionalModal>
  );
}
