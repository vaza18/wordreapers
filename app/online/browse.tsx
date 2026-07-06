import { Stack, router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BrowsePagination } from '@/components/BrowsePagination';
import { FeedbackPressable } from '@/components/FeedbackPressable';
import { HeaderBarButton } from '@/components/HeaderBarButton';
import { RefreshIcon } from '@/components/HeaderIcons';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useServerNow } from '@/hooks/useServerNow';
import { useTrainingMilestone } from '@/hooks/useTrainingMilestone';
import { useHeaderIconButtonLayout } from '@/hooks/useHeaderIconButtonLayout';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { joinErrorMessage } from '@/lib/firebase/join-error-message';
import { joinGameSession } from '@/lib/firebase/game-session-service';
import type {
  PublicLobbyBrowseCursor,
  PublicLobbyBrowseSort,
} from '@/lib/firebase/public-lobby-types';
import { fetchPublicLobbyPage } from '@/lib/firebase/public-lobby-service';
import { browseRangeForPage } from '@/lib/online/public-lobby/browse-pagination';
import { PUBLIC_LOBBY_PAGE_SIZE } from '@/lib/online/public-lobby/constants';
import { navigateToNewOnlineRoom } from '@/lib/online/create-room';
import { resolvePostJoinRoute } from '@/lib/online/post-join-route';
import { continueWithProfileOrRedirect } from '@/lib/online/require-profile';
import { stackHeaderBack } from '@/lib/navigation/stack-header-options';
import { UK_LOCALE } from '@/lib/dictionary/locale';
import { playerLanguageForBrowse } from '@/lib/online/public-lobby/content-safety';
import { useFirebaseStore } from '@/store/firebase-store';
import { useProfileStore } from '@/store/profile-store';
import type { PublicLobbyRow } from '@/lib/firebase/public-lobby-types';

function minutesLeft(expiresAt: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAt - now) / 60_000));
}

const BrowseLobbyRow = memo(function BrowseLobbyRow({
  row,
  joiningId,
  onJoin,
  styles,
  t,
}: {
  row: PublicLobbyRow;
  joiningId: string | null;
  onJoin: (gameId: string) => void;
  styles: ReturnType<typeof createStyles>;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const now = useServerNow(30_000);
  const full = row.playerCount >= row.maxPlayers;
  const mins = minutesLeft(row.expiresAt, now);

  return (
    <FeedbackPressable
      accessibilityRole="button"
      disabled={full || joiningId !== null}
      onPress={() => {
        onJoin(row.gameId);
      }}
      style={[styles.card, full && styles.cardDisabled]}
    >
      <Text style={styles.cardWord}>{row.baseWord.toUpperCase()}</Text>
      <Text style={styles.cardMeta}>
        {full
          ? t('online.browseRoomFull', {
              count: row.playerCount,
              max: row.maxPlayers,
            })
          : t('online.browseRoomSlots', {
              count: row.playerCount,
              max: row.maxPlayers,
              minutes: mins,
            })}
      </Text>
    </FeedbackPressable>
  );
});

export default function BrowsePublicLobbiesScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { refreshIconSize } = useHeaderIconButtonLayout();
  const { t } = useTranslation();
  const name = useProfileStore((state) => state.name);
  const gender = useProfileStore((state) => state.gender);
  const avatarColorIndex = useProfileStore((state) => state.avatarColorIndex);
  const firebaseUid = useFirebaseStore((state) => state.uid);
  const gameLanguage = playerLanguageForBrowse({ language: UK_LOCALE });
  const { hydrated: trainingHydrated, hasCompletedTrainingRound } = useTrainingMilestone();

  useEffect(() => {
    if (trainingHydrated && !hasCompletedTrainingRound) {
      router.replace('/online/join');
    }
  }, [hasCompletedTrainingRound, trainingHydrated]);

  const [sort, setSort] = useState<PublicLobbyBrowseSort>('newest');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PublicLobbyRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cursorsRef = useRef<Map<number, PublicLobbyBrowseCursor | null>>(new Map());

  const loadPage = useCallback(
    async (targetPage: number, nextSort: PublicLobbyBrowseSort, resetCursors: boolean) => {
      if (resetCursors) {
        cursorsRef.current = new Map();
      }
      setError(null);
      const result = await fetchPublicLobbyPage(
        gameLanguage,
        nextSort,
        targetPage,
        cursorsRef.current,
      );
      cursorsRef.current = result.cursors;
      setRows(result.rows);
      setPage(result.page);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    },
    [gameLanguage],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadPage(1, sort, true)
      .catch(() => {
        if (!cancelled) {
          setError(t('online.browseLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [gameLanguage, loadPage, sort, t]);

  const range = useMemo(
    () => browseRangeForPage(page, PUBLIC_LOBBY_PAGE_SIZE, total, rows.length),
    [page, rows.length, total],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadPage(page, sort, true);
    } catch {
      setError(t('online.browseLoadFailed'));
    } finally {
      setRefreshing(false);
    }
  }, [loadPage, page, sort, t]);

  const goToPage = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      try {
        await loadPage(targetPage, sort, false);
      } catch {
        setError(t('online.browseLoadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [loadPage, sort, t],
  );

  const changeSort = useCallback(
    (nextSort: PublicLobbyBrowseSort) => {
      if (nextSort === sort) {
        return;
      }
      setSort(nextSort);
      setPage(1);
    },
    [sort],
  );

  const handleCreateOnline = () => {
    if (!continueWithProfileOrRedirect('create')) {
      return;
    }
    const profile = useProfileStore.getState();
    navigateToNewOnlineRoom({
      name: profile.name,
      gender: profile.gender,
      avatarColorIndex: profile.avatarColorIndex,
    });
  };

  const handleJoin = useCallback(
    async (gameId: string) => {
      if (!firebaseUid) {
        return;
      }
      setJoiningId(gameId);
      setError(null);
      try {
        const session = await joinGameSession(
          gameId,
          { name, gender, avatarColorIndex },
          {
            joinSource: 'browse',
            playerLanguage: gameLanguage,
          },
        );
        const route = resolvePostJoinRoute(session, firebaseUid, gameId);
        router.replace(route);
      } catch (err) {
        setError(joinErrorMessage(err, t));
      } finally {
        setJoiningId(null);
      }
    },
    [avatarColorIndex, firebaseUid, gameLanguage, gender, name, t],
  );

  return (
    <>
      <Stack.Screen options={stackHeaderBack(() => router.back())} />
      <Screen scroll={false}>
        <View style={styles.toolbarRow}>
          <View style={styles.sortRow}>
            <FeedbackPressable
              accessibilityRole="button"
              onPress={() => {
                void changeSort('newest');
              }}
              style={[styles.sortChip, sort === 'newest' && styles.sortChipActive]}
            >
              <Text style={[styles.sortText, sort === 'newest' && styles.sortTextActive]}>
                {t('online.browseSortNewest')}
              </Text>
            </FeedbackPressable>
            <FeedbackPressable
              accessibilityRole="button"
              onPress={() => {
                void changeSort('baseWord');
              }}
              style={[styles.sortChip, sort === 'baseWord' && styles.sortChipActive]}
            >
              <Text style={[styles.sortText, sort === 'baseWord' && styles.sortTextActive]}>
                {t('online.browseSortBaseWord')}
              </Text>
            </FeedbackPressable>
          </View>
          <HeaderBarButton
            accessibilityLabel={t('common.refresh')}
            disabled={refreshing || loading}
            onPress={() => {
              void handleRefresh();
            }}
          >
            {refreshing ? (
              <ActivityIndicator color={colors.textSecondary} size="small" />
            ) : (
              <RefreshIcon size={refreshIconSize} color={colors.textSecondary} />
            )}
          </HeaderBarButton>
        </View>

        {total !== null && rows.length > 0 ? (
          <Text style={styles.range}>
            {t('online.browseRange', { from: range.from, to: range.to, total })}
          </Text>
        ) : null}

        {loading && rows.length === 0 ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : null}

        <ScrollView
          style={styles.listScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          contentContainerStyle={styles.list}
        >
          {rows.map((row) => (
            <BrowseLobbyRow
              key={row.gameId}
              row={row}
              joiningId={joiningId}
              onJoin={(gameId) => {
                void handleJoin(gameId);
              }}
              styles={styles}
              t={t}
            />
          ))}
          {!loading && rows.length === 0 ? (
            <Text style={styles.empty}>{t('online.browseEmpty')}</Text>
          ) : null}
        </ScrollView>

        <BrowsePagination
          currentPage={page}
          totalPages={totalPages}
          onFirst={() => {
            void goToPage(1);
          }}
          onPrev={() => {
            void goToPage(Math.max(1, page - 1));
          }}
          onNext={() => {
            void goToPage(page + 1);
          }}
          onLast={() => {
            if (totalPages) {
              void goToPage(totalPages);
            }
          }}
          onSelectPage={(target) => {
            void goToPage(target);
          }}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton label={t('nav.newGame')} onPress={handleCreateOnline} />
        <PrimaryButton label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </Screen>
    </>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    toolbarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    sortRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      flexShrink: 1,
    },
    sortChip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.backgroundSecondary,
    },
    sortChipActive: {
      backgroundColor: colors.accent,
    },
    sortText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    sortTextActive: {
      color: colors.textOnAccent,
      fontWeight: '600',
    },
    range: {
      fontSize: 11,
      color: colors.textTertiary,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    loader: {
      marginVertical: spacing.md,
    },
    listScroll: {
      flex: 1,
    },
    list: {
      gap: spacing.xs,
      paddingBottom: spacing.sm,
    },
    card: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderTertiary,
      borderRadius: 10,
      padding: spacing.sm,
      backgroundColor: colors.backgroundPrimary,
    },
    cardDisabled: {
      opacity: 0.5,
    },
    cardWord: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    cardMeta: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 4,
    },
    empty: {
      textAlign: 'center',
      color: colors.textSecondary,
      marginTop: spacing.lg,
    },
    error: {
      color: colors.danger,
      marginTop: spacing.sm,
      textAlign: 'center',
    },
  });
