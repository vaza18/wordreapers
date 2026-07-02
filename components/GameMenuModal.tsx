import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { PrimaryButton } from '@/components/PrimaryButton';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { modalCardChrome, modalOverlayBackground } from '@/lib/ui/modal-chrome';

interface GameMenuModalProps {
  visible: boolean;
  onClose: () => void;
  onPause: () => void;
  onProposeEnd: () => void;
  endGameLabel: string;
  onExit: () => void;
  onOpenSettings?: () => void;
  onInvite?: () => void;
  onOpenHowToPlay?: () => void;
  showPause?: boolean;
  showEndGame?: boolean;
  pauseLabel?: string;
  showInvite?: boolean;
  exitLabel?: string;
}

/**
 * In-round menu (mockup): continue, pause, settings, exit.
 */
export function GameMenuModal({
  visible,
  onClose,
  onPause,
  onProposeEnd,
  endGameLabel,
  onExit,
  onOpenSettings,
  onInvite,
  onOpenHowToPlay,
  showPause = true,
  showEndGame = true,
  pauseLabel,
  showInvite = false,
  exitLabel,
}: GameMenuModalProps) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.card} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>{t('game.menuTitle')}</Text>

          <FeedbackPressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.continueRow}
          >
            <Text style={styles.continueLabel}>{t('game.menuContinue')}</Text>
          </FeedbackPressable>

          {showPause ? (
            <PrimaryButton label={pauseLabel ?? t('game.menuPause')} onPress={onPause} />
          ) : null}

          {showInvite && onInvite ? (
            <PrimaryButton
              label={t('online.menuInvitePlayer')}
              variant="secondary"
              onPress={onInvite}
            />
          ) : null}

          {showEndGame ? (
            <PrimaryButton label={endGameLabel} variant="secondary" onPress={onProposeEnd} />
          ) : null}

          {onOpenHowToPlay ? (
            <PrimaryButton
              label={t('game.menuHowToPlay')}
              variant="secondary"
              onPress={onOpenHowToPlay}
            />
          ) : null}

          {onOpenSettings ? (
            <PrimaryButton label={t('nav.settings')} variant="secondary" onPress={onOpenSettings} />
          ) : null}

          <View style={styles.divider} />

          <PrimaryButton
            label={exitLabel ?? t('game.menuExit')}
            variant="secondary"
            onPress={onExit}
          />
        </View>
      </Pressable>
    </Modal>
  );
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
      borderRadius: radii.lg,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: spacing.xs,
    },
    continueRow: {
      backgroundColor: '#E1F5EE',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: '#9FE1CB',
      borderRadius: radii.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
    },
    continueLabel: {
      fontSize: 15,
      fontWeight: '500',
      color: '#085041',
      textAlign: 'center',
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderTertiary,
      marginVertical: spacing.xs,
    },
  });
}
