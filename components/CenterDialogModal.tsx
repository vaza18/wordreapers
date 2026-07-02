import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { ConditionalModal } from '@/lib/ui/conditional-modal';
import { modalCardChrome, modalOverlayBackground } from '@/lib/ui/modal-chrome';

interface CenterDialogModalProps {
  visible: boolean;
  title: string;
  body?: string;
  children?: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  tertiaryLabel?: string;
  onTertiary?: () => void;
  onRequestClose?: () => void;
  /** When false, backdrop tap and Android back do not close the dialog. */
  dismissOnBackdrop?: boolean;
  /** Light scale-in when the dialog becomes visible. */
  animateEntrance?: boolean;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      padding: spacing.lg,
      backgroundColor: modalOverlayBackground(colors),
    },
    card: {
      ...modalCardChrome(colors),
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
  tertiaryLabel,
  onTertiary,
  onRequestClose,
  dismissOnBackdrop = true,
  animateEntrance = false,
}: CenterDialogModalProps) {
  const styles = useThemedStyles(createStyles);
  const close = onRequestClose ?? onSecondary ?? onPrimary;
  const canDismissOnBackdrop = dismissOnBackdrop;
  const scale = useRef(new Animated.Value(animateEntrance ? 0.92 : 1)).current;
  const opacity = useRef(new Animated.Value(animateEntrance ? 0 : 1)).current;

  useEffect(() => {
    if (!visible || !animateEntrance) {
      return;
    }
    scale.setValue(0.92);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 120,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [animateEntrance, opacity, scale, visible]);

  const card = (
    <Animated.View
      style={[styles.card, animateEntrance ? { opacity, transform: [{ scale }] } : null]}
      onStartShouldSetResponder={() => true}
    >
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {children}
      <View style={styles.actions}>
        {secondaryLabel && onSecondary ? (
          <PrimaryButton label={secondaryLabel} variant="secondary" onPress={onSecondary} />
        ) : null}
        <PrimaryButton label={primaryLabel} onPress={onPrimary} />
        {tertiaryLabel && onTertiary ? (
          <PrimaryButton label={tertiaryLabel} variant="secondary" onPress={onTertiary} />
        ) : null}
      </View>
    </Animated.View>
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
