import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { rtdbTrafficProbe } from '@/lib/debug/rtdb-traffic-probe';
import { formatBytes } from '@/lib/debug/format-bytes';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useRtdbDiagnosticsStore } from '@/store/rtdb-diagnostics-store';

const COLLAPSED_HEIGHT = 48;
const MAX_DATA_POINTS = 60; // 60 seconds

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      backgroundColor: colors.backgroundPrimary,
      borderTopWidth: 1,
      borderTopColor: colors.borderSecondary,
    },
    collapsed: {
      height: COLLAPSED_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
    },
    expanded: {
      padding: spacing.md,
      gap: spacing.sm,
    },
    chart: {
      flex: 1,
      height: '100%',
    },
    legend: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginLeft: spacing.sm,
    },
    legendItem: {
      fontSize: 10,
      fontWeight: '600',
    },
    summary: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    summaryItem: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    actionLog: {
      marginTop: spacing.xs,
      gap: 2,
    },
    actionItem: {
      fontSize: 11,
      color: colors.textTertiary,
    },
  });
}

export function RtdbTrafficBanner() {
  const [expanded, setExpanded] = useState(false);
  const developerModeEnabled = useRtdbDiagnosticsStore((state) => state.developerModeEnabled);
  const rtdbDiagnosticsEnabled = useRtdbDiagnosticsStore((state) => state.rtdbDiagnosticsEnabled);
  const isHydrated = useRtdbDiagnosticsStore((state) => state.isHydrated);

  const [buckets, setBuckets] = useState(() => rtdbTrafficProbe.getLiveBuckets());
  const [actions, setActions] = useState(() => rtdbTrafficProbe.getRecentActions(1));
  const [roomTotals, setRoomTotals] = useState(() => rtdbTrafficProbe.getRoomTotals());
  const [chartWidth, setChartWidth] = useState(0);

  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();

  useEffect(() => {
    if (!isHydrated || !developerModeEnabled || !rtdbDiagnosticsEnabled) {
      return undefined;
    }

    // Immediate update on expanded toggle without waiting for next notify
    setActions(rtdbTrafficProbe.getRecentActions(expanded ? 5 : 1));

    let mounted = true;
    const unsub = rtdbTrafficProbe.subscribe(() => {
      if (!mounted) return;
      setBuckets([...rtdbTrafficProbe.getLiveBuckets()]);
      setActions(rtdbTrafficProbe.getRecentActions(expanded ? 5 : 1));
      setRoomTotals(rtdbTrafficProbe.getRoomTotals());
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, [isHydrated, developerModeEnabled, rtdbDiagnosticsEnabled, expanded]);

  const chartData = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const bySec = new Map(buckets.map((bucket) => [bucket.tSec, bucket]));
    const result = [];
    for (let i = 0; i < MAX_DATA_POINTS; i++) {
      const tSec = now - (MAX_DATA_POINTS - 1 - i);
      const b = bySec.get(tSec);
      result.push(b || { tSec, downBytes: 0, upBytes: 0 });
    }
    return result;
  }, [buckets]);

  const maxVal = Math.max(...chartData.map((b) => Math.max(b.downBytes, b.upBytes)), 1024); // min 1KB scale

  const generatePath = (type: 'down' | 'up', height: number) => {
    if (chartWidth <= 0) return 'M0,0';
    const h = height - 8;
    const points = chartData.map((b, i) => {
      const x = (i / (MAX_DATA_POINTS - 1)) * chartWidth;
      const val = type === 'down' ? b.downBytes : b.upBytes;
      const y = h - (val / maxVal) * h + 4;
      return `${x},${y}`;
    });
    return `M${points.join(' L')}`;
  };

  if (!isHydrated || !developerModeEnabled || !rtdbDiagnosticsEnabled) {
    return null;
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <Pressable onPress={() => setExpanded(!expanded)}>
        {expanded ? (
          <View style={styles.expanded}>
            <View style={styles.summary}>
              <Text style={styles.summaryItem}>
                {roomTotals.roomId
                  ? t('rtdbDiagnostics.roomLabel', { id: roomTotals.roomId })
                  : t('rtdbDiagnostics.noRoom')}
              </Text>
              <Text style={[styles.summaryItem, { color: colors.penBlue }]}>
                {t('rtdbDiagnostics.totalDown', { size: formatBytes(roomTotals.down) })}
              </Text>
              <Text style={[styles.summaryItem, { color: colors.destructiveAction }]}>
                {t('rtdbDiagnostics.totalUp', { size: formatBytes(roomTotals.up) })}
              </Text>
            </View>

            <View style={styles.summary}>
              <Text style={styles.summaryItem}>{t('rtdbDiagnostics.wireTotal')}</Text>
              <Text style={[styles.summaryItem, { color: colors.penBlue, opacity: 0.7 }]}>
                ↓ {formatBytes(roomTotals.wireRx || 0)}
              </Text>
              <Text style={[styles.summaryItem, { color: colors.destructiveAction, opacity: 0.7 }]}>
                ↑ {formatBytes(roomTotals.wireTx || 0)}
              </Text>
            </View>

            <View
              style={{ height: 60, width: '100%', marginTop: spacing.sm }}
              onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
            >
              <Svg height="60" width={chartWidth || 1}>
                <Path
                  d={generatePath('down', 60)}
                  stroke={colors.penBlue}
                  strokeWidth="1.5"
                  fill="none"
                />
                <Path
                  d={generatePath('up', 60)}
                  stroke={colors.destructiveAction}
                  strokeWidth="1.5"
                  fill="none"
                />
              </Svg>
            </View>

            <View style={styles.actionLog}>
              {actions.map((a, i) => (
                <Text key={`${a.timestamp}-${i}`} numberOfLines={1} style={styles.actionItem}>
                  • {a.action}
                  {a.details ? `: ${a.details}` : ''}
                  {a.observed ? ` ${t('rtdbDiagnostics.observed')}` : ''}
                </Text>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.collapsed}>
            <View style={styles.chart} onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
              <Svg height={COLLAPSED_HEIGHT} width={chartWidth || 1}>
                <Path
                  d={generatePath('down', COLLAPSED_HEIGHT)}
                  stroke={colors.penBlue}
                  strokeWidth="1.5"
                  fill="none"
                />
                <Path
                  d={generatePath('up', COLLAPSED_HEIGHT)}
                  stroke={colors.destructiveAction}
                  strokeWidth="1.5"
                  fill="none"
                />
              </Svg>
            </View>
            <View style={styles.legend}>
              <Text style={[styles.legendItem, { color: colors.penBlue }]}>↓</Text>
              <Text style={[styles.legendItem, { color: colors.destructiveAction }]}>↑</Text>
            </View>
          </View>
        )}
      </Pressable>
    </View>
  );
}
