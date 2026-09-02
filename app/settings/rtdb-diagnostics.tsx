import { useState, useMemo, useCallback } from 'react';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { Screen } from '@/components/Screen';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { copyTrafficHistoryCsv } from '@/lib/debug/copy-traffic-history-csv';
import { formatBytes } from '@/lib/debug/format-bytes';
import { useRtdbDiagnosticsStore } from '@/store/rtdb-diagnostics-store';
import { useToastStore } from '@/store/toast-store';
import type { TrafficHistoryEntry } from '@/lib/debug/rtdb-diagnostics-types';

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    emptyText: {
      color: colors.textSecondary,
      textAlign: 'center',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    clearAction: {
      color: colors.destructiveAction,
      fontWeight: '600',
    },
    copyAction: {
      color: colors.penBlue,
      fontWeight: '600',
    },
    detailHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    item: {
      backgroundColor: colors.backgroundPrimary,
      padding: spacing.md,
      borderRadius: 12,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.borderTertiary,
    },
    itemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    roomCode: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    timestamp: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    stats: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.xs,
    },
    statItem: {
      fontSize: 13,
    },
    timelineItem: {
      flexDirection: 'row',
      paddingVertical: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderTertiary,
      gap: spacing.sm,
    },
    timelineTime: {
      fontSize: 10,
      color: colors.textTertiary,
      width: 60,
    },
    timelineContent: {
      flex: 1,
    },
    timelineAction: {
      fontSize: 12,
      color: colors.textPrimary,
      fontWeight: '500',
    },
    timelineDetails: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    timelineTraffic: {
      fontSize: 11,
      fontWeight: '600',
    },
  });
}

interface TimelineEntry {
  key: string;
  timestamp: number;
  type: 'traffic' | 'action';
  down?: number;
  up?: number;
  wireRx?: number;
  wireTx?: number;
  action?: string;
  details?: string | null;
  observed?: boolean;
}

export default function RtdbDiagnosticsScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const developerModeEnabled = useRtdbDiagnosticsStore((state) => state.developerModeEnabled);
  const isHydrated = useRtdbDiagnosticsStore((state) => state.isHydrated);
  const history = useRtdbDiagnosticsStore((state) => state.history);
  const clearHistory = useRtdbDiagnosticsStore((state) => state.clearHistory);
  const enqueueToast = useToastStore((state) => state.enqueueToast);

  const [selectedEntry, setSelectedEntry] = useState<TrafficHistoryEntry | null>(null);

  const onCopyCsv = useCallback(async () => {
    if (!selectedEntry) return;
    await copyTrafficHistoryCsv(selectedEntry);
    enqueueToast(t('rtdbDiagnostics.copyCsvDone'), 'success');
  }, [enqueueToast, selectedEntry, t]);

  const timelineData = useMemo(() => {
    if (!selectedEntry) return [];

    const entries: TimelineEntry[] = [];

    selectedEntry.buckets.forEach((b) => {
      if (
        b.downBytes > 0 ||
        b.upBytes > 0 ||
        (b.wireRxBytes && b.wireRxBytes > 0) ||
        (b.wireTxBytes && b.wireTxBytes > 0)
      ) {
        entries.push({
          key: `t-${b.tSec}`,
          timestamp: b.tSec * 1000,
          type: 'traffic',
          down: b.downBytes,
          up: b.upBytes,
          wireRx: b.wireRxBytes,
          wireTx: b.wireTxBytes,
        });
      }
    });

    selectedEntry.actions.forEach((a, i) => {
      entries.push({
        key: `a-${a.timestamp}-${i}`,
        timestamp: a.timestamp,
        type: 'action',
        action: a.action,
        details: a.details,
        observed: a.observed,
      });
    });

    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }, [selectedEntry]);

  const renderTimelineItem = useCallback(
    ({ item }: { item: TimelineEntry }) => {
      const time = new Date(item.timestamp).toLocaleTimeString();

      return (
        <View style={styles.timelineItem}>
          <Text style={styles.timelineTime}>{time}</Text>
          <View style={styles.timelineContent}>
            {item.type === 'traffic' ? (
              <View>
                <Text>
                  <Text style={[styles.timelineTraffic, { color: colors.penBlue }]}>
                    ↓ {formatBytes(item.down || 0)}
                  </Text>
                  {'  '}
                  <Text style={[styles.timelineTraffic, { color: colors.destructiveAction }]}>
                    ↑ {formatBytes(item.up || 0)}
                  </Text>
                </Text>
                {item.wireRx !== undefined || item.wireTx !== undefined ? (
                  <Text>
                    <Text
                      style={[
                        styles.timelineTraffic,
                        { color: colors.penBlue, opacity: 0.6, fontSize: 10 },
                      ]}
                    >
                      {t('rtdbDiagnostics.wireDown', { size: formatBytes(item.wireRx || 0) })}
                    </Text>
                    {'  '}
                    <Text
                      style={[
                        styles.timelineTraffic,
                        { color: colors.destructiveAction, opacity: 0.6, fontSize: 10 },
                      ]}
                    >
                      {t('rtdbDiagnostics.wireUp', { size: formatBytes(item.wireTx || 0) })}
                    </Text>
                  </Text>
                ) : null}
              </View>
            ) : (
              <View>
                <Text style={styles.timelineAction}>
                  {item.action}
                  {item.observed ? ` ${t('rtdbDiagnostics.observed')}` : ''}
                </Text>
                {item.details ? <Text style={styles.timelineDetails}>{item.details}</Text> : null}
              </View>
            )}
          </View>
        </View>
      );
    },
    [colors.destructiveAction, colors.penBlue, styles, t],
  );

  const renderItem = useCallback(
    ({ item }: { item: TrafficHistoryEntry }) => (
      <FeedbackPressable onPress={() => setSelectedEntry(item)}>
        <View style={styles.item}>
          <View style={styles.itemRow}>
            <Text style={styles.roomCode}>
              {t('rtdbDiagnostics.roomLabel', { id: item.roomId })}
            </Text>
            <Text style={styles.timestamp}>{new Date(item.timestamp).toLocaleString()}</Text>
          </View>
          <View style={styles.stats}>
            <Text style={[styles.statItem, { color: colors.penBlue }]}>
              {t('rtdbDiagnostics.totalDown', { size: formatBytes(item.downTotal) })}
            </Text>
            <Text style={[styles.statItem, { color: colors.destructiveAction }]}>
              {t('rtdbDiagnostics.totalUp', { size: formatBytes(item.upTotal) })}
            </Text>
          </View>
          <View style={styles.stats}>
            <Text style={[styles.statItem, { color: colors.penBlue, opacity: 0.7 }]}>
              {t('rtdbDiagnostics.wireDown', { size: formatBytes(item.wireRxTotal || 0) })}
            </Text>
            <Text style={[styles.statItem, { color: colors.destructiveAction, opacity: 0.7 }]}>
              {t('rtdbDiagnostics.wireUp', { size: formatBytes(item.wireTxTotal || 0) })}
            </Text>
          </View>
        </View>
      </FeedbackPressable>
    ),
    [colors.destructiveAction, colors.penBlue, styles, t],
  );

  if (!isHydrated) {
    return null;
  }

  if (!developerModeEnabled) {
    return <Redirect href="/settings" />;
  }

  if (selectedEntry) {
    return (
      <Screen scroll={false}>
        <View style={styles.header}>
          <FeedbackPressable onPress={() => setSelectedEntry(null)}>
            <Text style={{ color: colors.penBlue, fontWeight: '600' }}>← {t('common.back')}</Text>
          </FeedbackPressable>
          <View style={styles.detailHeaderActions}>
            <FeedbackPressable
              onPress={() => {
                void onCopyCsv();
              }}
              accessibilityLabel={t('rtdbDiagnostics.copyCsvA11y', { id: selectedEntry.roomId })}
            >
              <Text style={styles.copyAction}>{t('rtdbDiagnostics.copyCsv')}</Text>
            </FeedbackPressable>
            <Text style={styles.roomCode}>
              {t('rtdbDiagnostics.roomLabel', { id: selectedEntry.roomId })}
            </Text>
          </View>
        </View>

        <FlatList
          data={timelineData}
          renderItem={renderTimelineItem}
          keyExtractor={(item) => item.key}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{t('rtdbDiagnostics.empty')}</Text>
            </View>
          }
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <Text style={styles.emptyText}>{t('rtdbDiagnostics.details')}</Text>
        {history.length > 0 ? (
          <FeedbackPressable onPress={clearHistory}>
            <Text style={styles.clearAction}>{t('rtdbDiagnostics.clearHistory')}</Text>
          </FeedbackPressable>
        ) : null}
      </View>

      <FlatList
        data={history}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.roomId}-${item.timestamp}`}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('rtdbDiagnostics.empty')}</Text>
          </View>
        }
      />
    </Screen>
  );
}
