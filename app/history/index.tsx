import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { PrimaryButton } from '@/components/PrimaryButton';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { toDisplayUpper } from '@/lib/dictionary/normalize';
import { formatResultsHeadline } from '@/lib/game/results-headline';
import { createOnlineResultsDirectory } from '@/lib/game/results-directory';
import { ensureAnonymousAuth } from '@/lib/firebase/auth';
import { resolveGameSessionSettingsForSession } from '@/lib/firebase/session-settings';
import { buildStandingsFromSession } from '@/lib/game/scoring';
import { isSoloStandings } from '@/lib/game/solo-round';
import { formatUkPlayers } from '@/lib/i18n/uk-plural';
import { didPlayerWinOnlineRound } from '@/lib/profile/player-stats';
import { formatProfileStatsSummary } from '@/lib/profile/format-profile-stats';
import { stackHeaderWithBackAndSettings } from '@/lib/navigation/stack-header-options';
import { formatArchiveSavedAt } from '@/lib/online/format-archive-date';
import { computeArchivedPlayerStats } from '@/lib/online/compute-archived-player-stats';
import {
  archiveRouteKey,
  listFinishedRoundArchives,
  type FinishedRoundArchive,
} from '@/lib/online/online-session-archive';
import { usePlayerStatsStore } from '@/store/player-stats-store';
import { useProfileStore } from '@/store/profile-store';
import { useFirebaseStore } from '@/store/firebase-store';

/**
 * Browse locally archived finished online rounds.
 */
export default function RoundHistoryScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [archives, setArchives] = useState<FinishedRoundArchive[] | null>(null);
  const gamesPlayed = usePlayerStatsStore((state) => state.gamesPlayed);
  const gamesWon = usePlayerStatsStore((state) => state.gamesWon);
  const wordsCollected = usePlayerStatsStore((state) => state.wordsCollected);
  const statsHydrated = usePlayerStatsStore((state) => state.hydrated);
  const hydratePlayerStats = usePlayerStatsStore((state) => state.hydratePlayerStats);
  const profileHydrated = useProfileStore((state) => state.hydrated);
  const profileName = useProfileStore((state) => state.name);
  const isProfileComplete = useProfileStore((state) => state.isComplete());
  const storeUid = useFirebaseStore((state) => state.uid);
  const [resolvedUid, setResolvedUid] = useState(storeUid ?? '');
  const myUid = resolvedUid || storeUid || '';

  const loadArchives = useCallback(async () => {
    setArchives(await listFinishedRoundArchives());
  }, []);

  useEffect(() => {
    void loadArchives();
  }, [loadArchives]);

  useEffect(() => {
    void ensureAnonymousAuth().then((user) => {
      setResolvedUid(user.uid);
    });
  }, []);

  useEffect(() => {
    if (!statsHydrated) {
      void hydratePlayerStats();
    }
  }, [hydratePlayerStats, statsHydrated]);

  const screenOptions = useMemo(
    () => ({
      ...stackHeaderWithBackAndSettings(() => {
        router.back();
      }),
      title: t('history.title'),
    }),
    [t],
  );

  const showStats = profileHydrated && isProfileComplete && statsHydrated;
  const archiveStats = useMemo(() => {
    if (!archives || !myUid) {
      return null;
    }
    return computeArchivedPlayerStats(archives, myUid, profileName);
  }, [archives, myUid, profileName]);

  const statsBand = showStats ? (
    <View style={styles.statsBand}>
      <Text style={styles.statsSummary}>
        {formatProfileStatsSummary(
          archiveStats?.gamesPlayed ?? gamesPlayed,
          archiveStats?.gamesWon ?? gamesWon,
          archiveStats?.wordsCollected ?? wordsCollected,
        )}
      </Text>
    </View>
  ) : null;

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
        {archives === null ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : archives.length === 0 ? (
          <View style={styles.emptyState}>
            {statsBand}
            <View style={styles.emptyBody}>
              <Text style={styles.empty}>{t('history.empty')}</Text>
              <PrimaryButton
                label={t('nav.home')}
                variant="secondary"
                onPress={() => {
                  router.back();
                }}
              />
            </View>
          </View>
        ) : (
          <>
            {statsBand}
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            >
              {archives.map((archive) => {
                const playerCount = Object.keys(archive.session.players).length;
                const standings = buildStandingsFromSession(archive.session);
                const directory = createOnlineResultsDirectory(archive.session, myUid || undefined);
                const uniqueBonusEnabled = resolveGameSessionSettingsForSession(
                  archive.session,
                ).uniqueBonusEnabled;
                const headline = formatResultsHeadline(t, directory, standings, uniqueBonusEnabled);
                const isSolo = isSoloStandings(standings);
                const isViewerWinner =
                  !isSolo &&
                  Boolean(myUid && archive.session.players[myUid]) &&
                  didPlayerWinOnlineRound(myUid, standings);

                return (
                  <FeedbackPressable
                    key={archiveRouteKey(archive.gameId, archive.baseWordRound)}
                    accessibilityRole="button"
                    feedback={false}
                    style={[
                      styles.card,
                      isSolo ? styles.cardSolo : null,
                      isViewerWinner ? styles.cardWinner : null,
                    ]}
                    onPress={() => {
                      router.push({
                        pathname: '/history/[archiveKey]',
                        params: {
                          archiveKey: archiveRouteKey(archive.gameId, archive.baseWordRound),
                        },
                      });
                    }}
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
              })}
            </ScrollView>
          </>
        )}
      </SafeAreaView>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
    },
    statsBand: {
      minHeight: 56,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statsSummary: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyState: {
      flex: 1,
    },
    emptyBody: {
      flex: 1,
      justifyContent: 'center',
      padding: spacing.md,
      gap: spacing.md,
    },
    empty: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      gap: spacing.sm,
    },
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
      fontSize: 14,
      color: colors.textSecondary,
    },
    cardMeta: {
      fontSize: 13,
      color: colors.textSecondary,
    },
  });
}
