import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import type { GameSessionSnapshot } from '@/lib/firebase/game-session-service';
import type { RoundPlayableLexicon } from '@/lib/dictionary/round-playable-lexicon';
import { tGendered } from '@/lib/game/grammar';
import { playerGenderForDisplay } from '@/lib/online/public-lobby/session-identity';

export interface LobbyBaseWordSectionProps {
  session: GameSessionSnapshot;
  gameId: string;
  myUid: string;
  pickerUid: string | null;
  pickerName: string;
  isPicker: boolean;
  hasBaseWord: boolean;
  isFinished: boolean;
  turnNumber: number;
  lobbyLexicon: RoundPlayableLexicon | null;
  lobbyLexiconLoading: boolean;
}

/** Picker banner, base-word block (tappable for the picker), and playable-words hint. */
export function LobbyBaseWordSection({
  session,
  gameId,
  myUid,
  pickerUid,
  pickerName,
  isPicker,
  hasBaseWord,
  isFinished,
  turnNumber,
  lobbyLexicon,
  lobbyLexiconLoading,
}: LobbyBaseWordSectionProps) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();

  const baseWordBlock =
    hasBaseWord && session.baseWord ? (
      <View style={styles.baseWordSection}>
        <Text style={styles.baseWordLabel}>{t('game.baseWord')}</Text>
        <Text style={styles.baseWordTitle}>{session.baseWord.toUpperCase()}</Text>
        <Text style={styles.baseWordMeta}>
          {tGendered(
            t,
            'online.baseWordChosenBy',
            myUid && pickerUid ? playerGenderForDisplay(session, myUid, pickerUid) : null,
            { name: pickerName },
          )}
        </Text>
        {isPicker && session.status === 'waiting' ? (
          <Text style={styles.baseWordChangeHint}>{t('online.baseWordChangeHint')}</Text>
        ) : null}
      </View>
    ) : null;

  return (
    <>
      {!isFinished && !hasBaseWord ? (
        <Text style={styles.pickerBanner}>
          {isPicker
            ? t('online.baseWordPickerYourTurn', { turn: turnNumber })
            : t('online.baseWordPickerWaiting', { name: pickerName, turn: turnNumber })}
        </Text>
      ) : null}

      {baseWordBlock && isPicker && session.status === 'waiting' ? (
        <FeedbackPressable
          accessibilityRole="button"
          onPress={() => {
            router.push({ pathname: '/online/pick-word/[gameId]', params: { gameId } });
          }}
          style={styles.baseWordBannerPressable}
        >
          {baseWordBlock}
        </FeedbackPressable>
      ) : (
        baseWordBlock
      )}

      {hasBaseWord && lobbyLexicon ? (
        <Text style={styles.playableWordsHint}>
          {t('online.playableWordsMax', { count: lobbyLexicon.maxCount })}
        </Text>
      ) : hasBaseWord && lobbyLexiconLoading ? (
        <Text style={styles.playableWordsHint}>{t('game.playableWordsLoading')}</Text>
      ) : null}
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    pickerBanner: {
      fontSize: 14,
      fontWeight: '500',
      color: '#633806',
      backgroundColor: '#FAEEDA',
      borderRadius: radii.sm,
      padding: spacing.sm,
      textAlign: 'center',
    },
    baseWordSection: {
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
    },
    baseWordLabel: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    baseWordTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.accent,
      textAlign: 'center',
    },
    baseWordMeta: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    baseWordBannerPressable: {
      backgroundColor: colors.accentMuted,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      marginVertical: spacing.xs,
    },
    baseWordChangeHint: {
      fontSize: 11,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
    playableWordsHint: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
  });
}
