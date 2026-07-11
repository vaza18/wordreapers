import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { toDisplayUpper } from '@/lib/dictionary/normalize';
import { resolveGameSessionSettingsForSession } from '@/lib/firebase/session-settings';
import { formatResultsHeadline } from '@/lib/game/results-headline';
import { createOnlineResultsDirectory } from '@/lib/game/results-directory';
import { buildStandingsFromSession } from '@/lib/game/scoring';
import { isSoloStandings } from '@/lib/game/solo-round';
import { resolveRoundSuccessLevel } from '@/lib/game/solo-round-success';
import { formatSoloSuccessHistoryHeadline } from '@/lib/game/solo-round-success-i18n';
import { formatUkPlayers } from '@/lib/i18n/uk-plural';
import { formatArchiveSavedAt } from '@/lib/online/format-archive-date';
import {
  archiveRouteKey,
  type FinishedRoundArchive,
} from '@/lib/online/session/online-session-archive';
import { didPlayerWinOnlineRound } from '@/lib/profile/player-stats';

export interface HistoryRoundCardProps {
  archive: FinishedRoundArchive;
  myUid: string;
  onPress: () => void;
}

export function HistoryRoundCard({ archive, myUid, onPress }: HistoryRoundCardProps) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();

  const playerCount = Object.keys(archive.session.players).length;
  const standings = buildStandingsFromSession(archive.session);
  const directory = createOnlineResultsDirectory(archive.session, myUid || undefined);
  const uniqueBonusEnabled = resolveGameSessionSettingsForSession(
    archive.session,
  ).uniqueBonusEnabled;
  const isSolo = isSoloStandings(standings);
  const lexiconMax = archive.playableLexicon?.maxCount ?? 0;
  const soloWordCount = standings[0]?.wordCount ?? 0;
  const soloLevel =
    isSolo && lexiconMax > 0 ? resolveRoundSuccessLevel(soloWordCount, lexiconMax) : null;
  const soloHeadline =
    soloLevel != null && soloLevel !== 'none'
      ? formatSoloSuccessHistoryHeadline(t, soloLevel, soloWordCount)
      : null;
  const headline =
    soloHeadline ?? formatResultsHeadline(t, directory, standings, uniqueBonusEnabled);
  const isViewerWinner =
    !isSolo &&
    Boolean(myUid && archive.session.players[myUid]) &&
    didPlayerWinOnlineRound(myUid, standings);

  return (
    <FeedbackPressable
      accessibilityRole="button"
      feedback={false}
      style={[
        styles.card,
        isSolo ? styles.cardSolo : null,
        isViewerWinner ? styles.cardWinner : null,
      ]}
      onPress={onPress}
    >
      <Text style={styles.cardDate}>{formatArchiveSavedAt(archive.savedAt)}</Text>
      <Text style={[styles.cardBaseWord, isSolo ? styles.cardBaseWordSolo : null]}>
        {toDisplayUpper(archive.session.baseWord)}
      </Text>
      <Text
        style={[styles.cardHeadline, isSolo ? styles.cardHeadlineSolo : null]}
        numberOfLines={2}
      >
        {headline}
      </Text>
      {!isSolo ? (
        <Text style={styles.cardMeta}>
          {t('history.roomCode', { code: archive.gameId })}
          {' · '}
          {formatUkPlayers(playerCount)}
          {archive.baseWordRound > 0
            ? ` · ${t('history.roundLabel', { round: archive.baseWordRound + 1 })}`
            : null}
        </Text>
      ) : null}
    </FeedbackPressable>
  );
}

export function historyRoundCardKey(archive: FinishedRoundArchive): string {
  return archiveRouteKey(archive.gameId, archive.baseWordRound);
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.backgroundPrimary,
      borderRadius: radii.md,
      padding: spacing.md,
      gap: spacing.xs,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSecondary,
    },
    cardSolo: {
      backgroundColor: 'transparent',
      borderColor: colors.borderTertiary,
    },
    cardWinner: {
      backgroundColor: colors.accentMuted,
      borderColor: colors.accent,
      borderWidth: 1,
    },
    cardDate: {
      fontSize: 13,
      color: colors.textTertiary,
    },
    cardBaseWord: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.accent,
    },
    cardBaseWordSolo: {
      fontSize: 17,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    cardHeadline: {
      fontSize: 15,
      color: colors.textPrimary,
      lineHeight: 20,
    },
    cardHeadlineSolo: {
      color: colors.textSecondary,
    },
    cardMeta: {
      fontSize: 13,
      color: colors.textTertiary,
    },
  });
}
