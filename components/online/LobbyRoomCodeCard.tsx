import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { LobbyQrCode } from '@/components/LobbyQrCode';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { formatRoomCodeDisplay } from '@/lib/firebase/format-room-code';

export interface LobbyRoomCodeCardProps {
  roomCode: string;
  invitedByUid?: string;
}

/** Room code + QR invite card shown at the top of the waiting lobby. */
export function LobbyRoomCodeCard({ roomCode, invitedByUid }: LobbyRoomCodeCardProps) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();

  return (
    <View style={styles.codeCard}>
      <Text style={styles.code}>{formatRoomCodeDisplay(roomCode)}</Text>
      <Text style={styles.codeLabel}>{t('online.roomCodeLabel')}</Text>
      <LobbyQrCode roomCode={roomCode} invitedByUid={invitedByUid} />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    codeCard: {
      backgroundColor: colors.backgroundPrimary,
      borderRadius: radii.md,
      padding: spacing.md,
      alignItems: 'center',
      gap: spacing.sm,
    },
    code: {
      fontSize: 28,
      fontWeight: '600',
      color: colors.accent,
      letterSpacing: 6,
    },
    codeLabel: {
      fontSize: 12,
      color: colors.textSecondary,
    },
  });
}
