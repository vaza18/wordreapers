import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { PrimaryButton } from '@/components/PrimaryButton';
import type { JoinQrPayload } from '@/lib/online/parse-join-qr';
import { isExpoCameraAvailable } from '@/lib/native/is-expo-camera-available';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

interface RoomQrScannerProps {
  visible: boolean;
  onClose: () => void;
  onCodeScanned: (payload: JoinQrPayload) => void;
}

/**
 * QR scanner modal — never imports expo-camera unless native module exists.
 */
export function RoomQrScanner({ visible, onClose, onCodeScanned }: RoomQrScannerProps) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const cameraAvailable = isExpoCameraAvailable();

  if (!visible) {
    return null;
  }

  let cameraBody: ReactNode = null;
  if (cameraAvailable) {
    try {
      const { RoomQrScannerCamera } =
        require('./RoomQrScannerCamera') as typeof import('./RoomQrScannerCamera');
      cameraBody = <RoomQrScannerCamera onClose={onClose} onCodeScanned={onCodeScanned} />;
    } catch {
      cameraBody = null;
    }
  }

  const unavailable = !cameraAvailable || cameraBody === null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title}>{t('online.scanQrTitle')}</Text>

        {unavailable ? (
          <View style={styles.messageBox}>
            <Text style={styles.message}>{t('online.scanQrUnavailable')}</Text>
            <PrimaryButton label={t('common.close')} variant="secondary" onPress={onClose} />
          </View>
        ) : (
          cameraBody
        )}

        {!unavailable ? (
          <FeedbackPressable accessibilityRole="button" onPress={onClose} style={styles.cancelWrap}>
            <Text style={styles.cancel}>{t('common.cancel')}</Text>
          </FeedbackPressable>
        ) : null}
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
      padding: spacing.md,
      gap: spacing.md,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
      marginTop: spacing.lg,
    },
    messageBox: {
      flex: 1,
      justifyContent: 'center',
      gap: spacing.md,
    },
    message: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    cancelWrap: {
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    cancel: {
      fontSize: 16,
      color: colors.textSecondary,
    },
  });
}
