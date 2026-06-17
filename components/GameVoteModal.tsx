import { useTranslation } from 'react-i18next';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, radii, spacing } from '@/constants/theme';

interface GameVoteModalProps {
  visible: boolean;
  message: string;
  showVoteButtons: boolean;
  onYes: () => void;
  onNo: () => void;
  onResume?: () => void;
}

function VoteCard({
  message,
  showVoteButtons,
  onYes,
  onNo,
  onResume,
}: Omit<GameVoteModalProps, 'visible'>) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();

  return (
    <View style={[styles.overlay, { paddingBottom: spacing.lg + bottom }]}>
      <View style={styles.card}>
        <Text style={styles.message}>{message}</Text>
        {showVoteButtons ? (
          <View style={styles.row}>
            <PrimaryButton label={t('game.voteYes')} style={styles.btn} onPress={onYes} />
            <PrimaryButton
              label={t('game.voteNo')}
              variant="secondary"
              style={styles.btn}
              onPress={onNo}
            />
          </View>
        ) : null}
        {onResume ? <PrimaryButton label={t('game.pauseResume')} onPress={onResume} /> : null}
      </View>
    </View>
  );
}

/**
 * Centered vote dialog (early finish / pause) for online multiplayer.
 */
export function GameVoteModal({
  visible,
  message,
  showVoteButtons,
  onYes,
  onNo,
  onResume,
}: GameVoteModalProps) {
  return (
    <Modal transparent visible={visible} animationType="fade">
      <SafeAreaProvider>
        <VoteCard
          message={message}
          showVoteButtons={showVoteButtons}
          onYes={onYes}
          onNo={onNo}
          onResume={onResume}
        />
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    backgroundColor: colors.backgroundPrimary,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'stretch',
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  btn: {
    flex: 1,
  },
});
