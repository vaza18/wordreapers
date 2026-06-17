import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { buildRoomJoinUrl } from '@/lib/online/join-link';
import { colors, spacing } from '@/constants/theme';

interface LobbyQrCodeProps {
  roomCode: string;
  size?: number;
  /** Uid embedded in the join link for invite attribution toasts. */
  invitedByUid?: string;
}

/**
 * QR encodes join deep link for the room (mockup lobby screen 4).
 */
export function LobbyQrCode({ roomCode, size = 112, invitedByUid }: LobbyQrCodeProps) {
  const { t } = useTranslation();
  const value = buildRoomJoinUrl(roomCode, invitedByUid);

  return (
    <View style={styles.wrap} accessibilityLabel={t('online.qrJoinLabel')}>
      <QRCode
        value={value}
        size={size}
        color={colors.textPrimary}
        backgroundColor={colors.backgroundPrimary}
      />
      <Text style={styles.caption}>{t('online.qrJoinLabel')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  caption: {
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
