import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

export interface LobbyActionFooterProps {
  gameId: string;
  isFinished: boolean;
  isOrganizer: boolean;
  isPicker: boolean;
  hasBaseWord: boolean;
  isFirstRound: boolean;
  canStart: boolean;
  starting: boolean;
  rematchLoading: boolean;
  lobbyLexiconLoading: boolean;
  pickerName: string;
  turnNumber: number;
  onRematch: () => void;
  onStart: () => void;
}

/** Rematch / pick / configure / start buttons plus waiting hints at the bottom of the lobby. */
export function LobbyActionFooter({
  gameId,
  isFinished,
  isOrganizer,
  isPicker,
  hasBaseWord,
  isFirstRound,
  canStart,
  starting,
  rematchLoading,
  lobbyLexiconLoading,
  pickerName,
  turnNumber,
  onRematch,
  onStart,
}: LobbyActionFooterProps) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();

  return (
    <>
      {isFinished ? (
        <>
          <PrimaryButton
            label={t('game.newGameSamePlayers')}
            disabled={rematchLoading}
            onPress={() => {
              onRematch();
            }}
          />
          {!isOrganizer ? (
            <Text style={styles.waitingHint}>{t('online.waitingForRematch')}</Text>
          ) : null}
        </>
      ) : null}

      {isPicker && !isFinished && !hasBaseWord ? (
        <PrimaryButton
          label={t('online.pickBaseWordAction')}
          onPress={() => {
            router.push({ pathname: '/online/pick-word/[gameId]', params: { gameId } });
          }}
        />
      ) : null}

      {isOrganizer && !isFinished && isFirstRound && !hasBaseWord ? (
        <PrimaryButton
          label={t('online.configureGame')}
          variant="secondary"
          onPress={() => {
            router.replace({
              pathname: '/online/setup',
              params: { gameId, from: 'lobby' },
            });
          }}
        />
      ) : null}

      {isPicker && !isFinished ? (
        <>
          <PrimaryButton
            label={t('online.startGame')}
            disabled={!canStart || starting || lobbyLexiconLoading}
            onPress={() => {
              onStart();
            }}
          />
          <Text style={styles.startHint}>{t('online.startHint')}</Text>
        </>
      ) : null}

      {!isPicker && !isFinished && hasBaseWord ? (
        <Text style={styles.waitingHint}>
          {t('online.waitingForRoundStart', { name: pickerName })}
        </Text>
      ) : null}

      {!isOrganizer && !isFinished && !hasBaseWord && !isPicker ? (
        <Text style={styles.waitingHint}>
          {t('online.baseWordPickerWaiting', { name: pickerName, turn: turnNumber })}
        </Text>
      ) : null}
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    startHint: {
      fontSize: 12,
      color: colors.textTertiary,
      textAlign: 'center',
    },
    waitingHint: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
}
