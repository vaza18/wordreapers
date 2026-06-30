import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HistoryRoomStatsBand } from '@/components/HistoryRoomStatsBand';
import { historyRoundCardKey, HistoryRoundCard } from '@/components/HistoryRoundCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useOnlineViewerUid } from '@/hooks/useOnlineViewerUid';
import { normalizeRoomCode } from '@/lib/firebase/room-code';
import { stackHeaderWithBackAndSettings } from '@/lib/navigation/stack-header-options';
import { archiveRouteKey, listFinishedRoundArchives } from '@/lib/online/online-session-archive';
import {
  computeRoomHistoryAggregate,
  filterMultiplayerArchivesForGame,
} from '@/lib/online/room-history-aggregate';

/**
 * Round list for one room (multi-round rematch history).
 */
export default function RoomHistoryScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { gameId: rawGameId } = useLocalSearchParams<{ gameId: string }>();
  const gameId = normalizeRoomCode(rawGameId ?? '');
  const myUid = useOnlineViewerUid();
  const [loading, setLoading] = useState(true);
  const [roundArchives, setRoundArchives] = useState<ReturnType<
    typeof filterMultiplayerArchivesForGame
  > | null>(null);

  const loadArchives = useCallback(async () => {
    if (!gameId) {
      setRoundArchives([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const archives = await listFinishedRoundArchives();
    setRoundArchives(filterMultiplayerArchivesForGame(archives, gameId));
    setLoading(false);
  }, [gameId]);

  useEffect(() => {
    void loadArchives();
  }, [loadArchives]);

  const roomAggregate = useMemo(() => {
    if (!roundArchives || roundArchives.length === 0) {
      return null;
    }
    return computeRoomHistoryAggregate(gameId, roundArchives, myUid);
  }, [gameId, myUid, roundArchives]);

  const screenOptions = useMemo(
    () => ({
      ...stackHeaderWithBackAndSettings(() => {
        router.back();
      }),
      title: t('history.roomTitle', { code: gameId }),
    }),
    [gameId, t],
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : roundArchives == null || roundArchives.length === 0 || !roomAggregate ? (
          <View style={styles.centered}>
            <PrimaryButton
              label={t('history.backToList')}
              variant="secondary"
              onPress={() => {
                router.replace('/history');
              }}
            />
          </View>
        ) : (
          <View style={styles.body}>
            <HistoryRoomStatsBand aggregate={roomAggregate} myUid={myUid} />
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            >
              {roundArchives.map((archive) => (
                <HistoryRoundCard
                  key={historyRoundCardKey(archive)}
                  archive={archive}
                  myUid={myUid}
                  onPress={() => {
                    router.push({
                      pathname: '/history/[archiveKey]',
                      params: {
                        archiveKey: archiveRouteKey(archive.gameId, archive.baseWordRound),
                      },
                    });
                  }}
                />
              ))}
            </ScrollView>
          </View>
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
    body: {
      flex: 1,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.md,
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      gap: spacing.sm,
    },
  });
}
