import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HistoryRoomAggregateCard } from '@/components/HistoryRoomAggregateCard';
import { historyRoundCardKey, HistoryRoundCard } from '@/components/HistoryRoundCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SegmentedControl } from '@/components/SegmentedControl';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useOnlineViewerUid } from '@/hooks/useOnlineViewerUid';
import {
  formatCompetitionStatsLine,
  formatTrainingStatsLine,
} from '@/lib/profile/format-profile-stats';
import { stackHeaderWithBackAndSettings } from '@/lib/navigation/stack-header-options';
import { computeArchivedPlayerStats } from '@/lib/online/compute-archived-player-stats';
import {
  archiveRouteKey,
  listFinishedRoundArchives,
  type FinishedRoundArchive,
} from '@/lib/online/session/online-session-archive';
import {
  buildHistoryListEntries,
  filterHistoryListEntries,
  type HistoryListFilter,
} from '@/lib/online/room-history-aggregate';
import { usePlayerStatsStore } from '@/store/player-stats-store';
import { useProfileStore } from '@/store/profile-store';

/**
 * Browse locally archived finished online rounds.
 */
export default function RoundHistoryScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [archives, setArchives] = useState<FinishedRoundArchive[] | null>(null);
  const [listFilter, setListFilter] = useState<HistoryListFilter>('all');
  const competition = usePlayerStatsStore((state) => state.competition);
  const training = usePlayerStatsStore((state) => state.training);
  const statsHydrated = usePlayerStatsStore((state) => state.hydrated);
  const hydratePlayerStats = usePlayerStatsStore((state) => state.hydratePlayerStats);
  const profileHydrated = useProfileStore((state) => state.hydrated);
  const profileName = useProfileStore((state) => state.name);
  const isProfileComplete = useProfileStore((state) => state.isComplete());
  const myUid = useOnlineViewerUid();

  const loadArchives = useCallback(async () => {
    setArchives(await listFinishedRoundArchives());
  }, []);

  useEffect(() => {
    void loadArchives();
  }, [loadArchives]);

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

  const filterOptions = useMemo(
    () => [
      { value: 'all' as const, label: t('history.filterAll') },
      { value: 'competition' as const, label: t('history.filterCompetition') },
      { value: 'training' as const, label: t('history.filterTraining') },
    ],
    [t],
  );

  const showStats = profileHydrated && isProfileComplete && statsHydrated;
  const archiveStats = useMemo(() => {
    if (!archives || !myUid) {
      return null;
    }
    return computeArchivedPlayerStats(archives, myUid, profileName);
  }, [archives, myUid, profileName]);

  const splitStats = archiveStats ?? {
    competition,
    training,
  };

  const listEntries = useMemo(() => {
    if (!archives) {
      return [];
    }
    return filterHistoryListEntries(buildHistoryListEntries(archives, myUid), listFilter);
  }, [archives, myUid, listFilter]);

  const statsBand = showStats ? (
    <View style={styles.statsBand}>
      {listFilter !== 'training' ? (
        <Text style={styles.statsSummary}>
          {formatCompetitionStatsLine(splitStats.competition)}
        </Text>
      ) : null}
      {listFilter !== 'competition' ? (
        <Text style={styles.statsSummary}>{formatTrainingStatsLine(splitStats.training)}</Text>
      ) : null}
    </View>
  ) : null;

  const filterChips = (
    <View style={styles.filterRow}>
      <SegmentedControl options={filterOptions} value={listFilter} onChange={setListFilter} />
    </View>
  );

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
            {filterChips}
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
            {filterChips}
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            >
              {listEntries.length === 0 ? (
                <Text style={styles.emptyFilter}>{t('history.emptyFilter')}</Text>
              ) : (
                listEntries.map((entry) => {
                  if (entry.kind === 'room') {
                    return (
                      <HistoryRoomAggregateCard
                        key={`room-${entry.aggregate.gameId}`}
                        aggregate={entry.aggregate}
                        myUid={myUid}
                        onPress={() => {
                          router.push({
                            pathname: '/history/room/[gameId]',
                            params: { gameId: entry.aggregate.gameId },
                          });
                        }}
                      />
                    );
                  }

                  return (
                    <HistoryRoundCard
                      key={historyRoundCardKey(entry.archive)}
                      archive={entry.archive}
                      myUid={myUid}
                      onPress={() => {
                        router.push({
                          pathname: '/history/[archiveKey]',
                          params: {
                            archiveKey: archiveRouteKey(
                              entry.archive.gameId,
                              entry.archive.baseWordRound,
                            ),
                          },
                        });
                      }}
                    />
                  );
                })
              )}
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
      paddingVertical: spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    statsSummary: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    filterRow: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
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
    emptyFilter: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      gap: spacing.sm,
    },
  });
}
