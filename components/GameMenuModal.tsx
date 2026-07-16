import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { SettingsIconButton } from '@/components/SettingsIconButton';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import {
  buildGameMenuGroups,
  type GameMenuItemDef,
  type GameMenuItemId,
} from '@/lib/ui/game-menu-groups';
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
  showExit?: boolean;
  exitLabel?: string;
}

/**
 * In-round menu (Variant C): left-aligned icon+label list with leave actions last.
 * Settings open from the header gear; dismiss via ✕ or overlay (no “continue” row).
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
  showExit = true,
  exitLabel,
}: GameMenuModalProps) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();

  const groups = buildGameMenuGroups({
    showPause,
    showInvite: Boolean(showInvite && onInvite),
    showEndGame,
    showExit,
    showHowToPlay: Boolean(onOpenHowToPlay),
  });

  const labelFor = (id: GameMenuItemId): string => {
    switch (id) {
      case 'pause':
        return pauseLabel ?? t('game.menuPause');
      case 'invite':
        return t('online.menuInvitePlayer');
      case 'endGame':
        return endGameLabel;
      case 'exit':
        return exitLabel ?? t('game.menuExit');
      case 'howToPlay':
        return t('game.menuHowToPlay');
    }
  };

  const onPressFor = (id: GameMenuItemId): (() => void) => {
    switch (id) {
      case 'pause':
        return onPause;
      case 'invite':
        return onInvite ?? onClose;
      case 'endGame':
        return onProposeEnd;
      case 'exit':
        return onExit;
      case 'howToPlay':
        return onOpenHowToPlay ?? onClose;
    }
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.card} onStartShouldSetResponder={() => true}>
          <View style={styles.titleRow}>
            {onOpenSettings ? (
              <SettingsIconButton onPress={onOpenSettings} />
            ) : (
              <View style={styles.titleSide} />
            )}
            <Text style={styles.title}>{t('game.menuTitle')}</Text>
            <FeedbackPressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              hitSlop={8}
              onPress={onClose}
              style={styles.closeButton}
            >
              <Text style={styles.closeGlyph}>✕</Text>
            </FeedbackPressable>
          </View>

          {groups.map((group, groupIndex) => (
            <View key={group.id}>
              {groupIndex > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.group}>
                {group.items.map((item) => (
                  <MenuRow
                    key={item.id}
                    item={item}
                    label={labelFor(item.id)}
                    onPress={onPressFor(item.id)}
                    styles={styles}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

function MenuRow({
  item,
  label,
  onPress,
  styles,
}: {
  item: GameMenuItemDef;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <FeedbackPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.row, styles.neutralRow]}
    >
      <Text style={styles.icon} accessibilityElementsHidden importantForAccessibility="no">
        {item.icon}
      </Text>
      <Text style={styles.label}>{label}</Text>
    </FeedbackPressable>
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
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    titleSide: {
      width: 32,
    },
    title: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    closeButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.sm,
    },
    closeGlyph: {
      fontSize: 18,
      fontWeight: '500',
      color: colors.textSecondary,
      lineHeight: 22,
    },
    group: {
      gap: spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: radii.sm,
      gap: spacing.sm,
    },
    neutralRow: {
      backgroundColor: colors.backgroundPrimary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSecondary,
    },
    icon: {
      width: 24,
      fontSize: 15,
      fontWeight: '500',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    label: {
      flex: 1,
      fontSize: 15,
      fontWeight: '500',
      color: colors.textPrimary,
      textAlign: 'left',
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderTertiary,
      marginVertical: spacing.xs,
    },
  });
}
