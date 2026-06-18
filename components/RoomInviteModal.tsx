import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { LobbyQrCode } from '@/components/LobbyQrCode';
import { colors, radii, spacing } from '@/constants/theme';
import { formatRoomCodeDisplay } from '@/lib/firebase/format-room-code';

interface RoomInviteModalProps {
  visible: boolean;
  onClose: () => void;
  roomCode: string;
  /** Shown when a round is already in progress. */
  roundInProgress?: boolean;
  /** Uid embedded in the QR join link for invite attribution toasts. */
  invitedByUid?: string;
}

function InviteBody({
  onClose,
  roomCode,
  roundInProgress,
  invitedByUid,
}: {
  onClose: () => void;
  roomCode: string;
  roundInProgress: boolean;
  invitedByUid?: string;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();

  return (
    <Pressable style={styles.overlay} onPress={onClose}>
      <View
        style={[styles.card, { paddingBottom: spacing.lg + bottom }]}
        onStartShouldSetResponder={() => true}
      >
        <Text style={styles.title}>{t('online.inviteModalTitle')}</Text>
        <Text style={styles.hint}>
          {roundInProgress
            ? t('online.inviteModalHintPlaying')
            : t('online.inviteModalHintWaiting')}
        </Text>
        <Text style={styles.code}>{formatRoomCodeDisplay(roomCode)}</Text>
        <Text style={styles.codeLabel}>{t('online.roomCodeLabel')}</Text>
        <LobbyQrCode roomCode={roomCode} size={128} invitedByUid={invitedByUid} />
        <FeedbackPressable accessibilityRole="button" onPress={onClose} style={styles.closeRow}>
          <Text style={styles.closeLabel}>{t('common.close')}</Text>
        </FeedbackPressable>
      </View>
    </Pressable>
  );
}

/**
 * Compact invite sheet: room code + QR (timer keeps running).
 */
export function RoomInviteModal({
  visible,
  onClose,
  roomCode,
  roundInProgress = false,
  invitedByUid,
}: RoomInviteModalProps) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <SafeAreaProvider>
        <InviteBody
          onClose={onClose}
          roomCode={roomCode}
          roundInProgress={roundInProgress}
          invitedByUid={invitedByUid}
        />
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  card: {
    backgroundColor: colors.backgroundPrimary,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  code: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.accent,
    letterSpacing: 6,
    marginTop: spacing.xs,
  },
  codeLabel: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  closeRow: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  closeLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.accent,
    textAlign: 'center',
  },
});
