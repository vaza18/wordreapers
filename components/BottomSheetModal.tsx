import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 0,
    },
    sheet: {
      zIndex: 1,
      backgroundColor: colors.backgroundPrimary,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      padding: spacing.lg,
      gap: spacing.sm,
    },
  });
}

function BottomSheetBody({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const { bottom } = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.overlay}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={styles.backdrop}
        onPress={onClose}
      />
      <View style={[styles.sheet, { paddingBottom: spacing.lg + bottom }]}>{children}</View>
    </View>
  );
}

/**
 * Bottom sheet with dimmed backdrop — tap outside or Android back closes it.
 * Modal gets its own SafeAreaProvider so bottom inset includes the OS nav bar.
 */
export function BottomSheetModal({ visible, onClose, children }: BottomSheetModalProps) {
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <BottomSheetBody onClose={onClose}>{children}</BottomSheetBody>
      </SafeAreaProvider>
    </Modal>
  );
}
