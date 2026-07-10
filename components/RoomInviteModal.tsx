import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { LobbyQrCode } from '@/components/LobbyQrCode';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { modalOverlayBackground, modalSheetChrome } from '@/lib/ui/modal-chrome';
import { formatRoomCodeDisplay } from '@/lib/firebase/format-room-code';

interface RoomInviteModalProps {
  visible: boolean;
  onClose: () => void;
  roomCode: string;
  /** Shown when a round is already in progress. */
  roundInProgress?: boolean;
  /** Uid embedded in the QR join link for invite attribution toasts. */
  invitedByUid?: string;
  /** Optional content above the invite sheet (e.g. session vote banner). */
  topContent?: ReactNode;
}

function InviteBody({
  onClose,
  roomCode,
  roundInProgress,
  invitedByUid,
  topContent,
}: {
  onClose: () => void;
  roomCode: string;
  roundInProgress: boolean;
  invitedByUid?: string;
  topContent?: ReactNode;
}) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
      <View style={styles.bottomStack} onStartShouldSetResponder={() => true}>
        {topContent ? <View style={styles.stackVote}>{topContent}</View> : null}
        <View style={[styles.card, { paddingBottom: spacing.lg + bottom }]}>
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
      </View>
    </View>
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
  topContent,
}: RoomInviteModalProps) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <SafeAreaProvider>
        <InviteBody
          onClose={onClose}
          roomCode={roomCode}
          roundInProgress={roundInProgress}
          invitedByUid={invitedByUid}
          topContent={topContent}
        />
      </SafeAreaProvider>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: modalOverlayBackground(colors),
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
    },
    bottomStack: {
      width: '100%',
      zIndex: 1,
      gap: spacing.sm,
    },
    stackVote: {
      width: '100%',
    },
    card: {
      ...modalSheetChrome(colors),
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
}
