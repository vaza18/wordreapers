import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HistoryRoomAggregateCard } from '@/components/HistoryRoomAggregateCard';
import { historyRoundCardKey, HistoryRoundCard } from '@/components/HistoryRoundCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useOnlineViewerUid } from '@/hooks/useOnlineViewerUid';
import { formatProfileStatsSummary } from '@/lib/profile/format-profile-stats';
import { stackHeaderWithBackAndSettings } from '@/lib/navigation/stack-header-options';
import { computeArchivedPlayerStats } from '@/lib/online/compute-archived-player-stats';
import {
  archiveRouteKey,
  listFinishedRoundArchives,
  type FinishedRoundArchive,
} from '@/lib/online/session/online-session-archive';
import { buildHistoryListEntries } from '@/lib/online/room-history-aggregate';
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
  const gamesPlayed = usePlayerStatsStore((state) => state.gamesPlayed);
  const gamesWon = usePlayerStatsStore((state) => state.gamesWon);
  const wordsCollected = usePlayerStatsStore((state) => state.wordsCollected);
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

  const showStats = profileHydrated && isProfileComplete && statsHydrated;
  const archiveStats = useMemo(() => {
    if (!archives || !myUid) {
      return null;
    }
    return computeArchivedPlayerStats(archives, myUid, profileName);
  }, [archives, myUid, profileName]);

  const listEntries = useMemo(() => {
    if (!archives) {
      return [];
    }
    return buildHistoryListEntries(archives, myUid);
  }, [archives, myUid]);

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
              {listEntries.map((entry) => {
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
  });
}
