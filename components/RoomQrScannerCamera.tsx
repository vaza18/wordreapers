import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { parseJoinQrPayload, type JoinQrPayload } from '@/lib/online/parse-join-qr';
import { colors, radii, spacing } from '@/constants/theme';

interface RoomQrScannerCameraProps {
  onClose: () => void;
  onCodeScanned: (payload: JoinQrPayload) => void;
}

/**
 * Camera UI — only loaded when {@link isExpoCameraAvailable} is true.
 */
export function RoomQrScannerCamera({ onClose, onCodeScanned }: RoomQrScannerCameraProps) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBarcode = ({ data }: { data: string }) => {
    if (scanned) {
      return;
    }
    const payload = parseJoinQrPayload(data);
    if (!payload) {
      return;
    }
    setScanned(true);
    onCodeScanned(payload);
    onClose();
  };

  if (!permission?.granted) {
    return (
      <View style={styles.messageBox}>
        <Text style={styles.message}>{t('online.scanQrPermission')}</Text>
        <PrimaryButton
          label={t('online.scanQrAllowCamera')}
          onPress={() => {
            void requestPermission();
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.cameraWrap}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcode}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  cameraWrap: {
    flex: 1,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
});
