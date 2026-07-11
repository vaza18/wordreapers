import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { ukWordForm } from '@/lib/i18n/uk-plural';
import {
  resolveSuccessBarSegment,
  soloSuccessMedal,
  type SoloSuccessLevelId,
} from '@/lib/game/solo-round-success';
import { wordsUntilTrainingUnlock } from '@/lib/onboarding/training-milestone';

type TrainingProgressBarProps = {
  wordCount: number;
  lexiconMax: number;
  /** When true, caption may mention words left to unlock multiplayer. */
  showUnlockHint?: boolean;
  /** Skip outer horizontal padding (e.g. inside RoundResultsView header). */
  embedded?: boolean;
  /** When false, only the track + caption are shown (badge lives elsewhere). */
  showLevelLabel?: boolean;
};

const LEVEL_TITLE_KEYS: Record<Exclude<SoloSuccessLevelId, 'none'>, string> = {
  progress: 'soloSuccess.levelProgress',
  goodPace: 'soloSuccess.levelGoodPace',
  strong: 'soloSuccess.levelStrong',
  top: 'soloSuccess.levelTop',
  champion: 'soloSuccess.levelChampion',
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xs,
      gap: spacing.xs,
    },
    wrapEmbedded: {
      paddingHorizontal: 0,
      paddingBottom: 0,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      flexShrink: 1,
      maxWidth: '42%',
    },
    track: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.controlTrack,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      backgroundColor: colors.accent,
      borderRadius: 2,
    },
    caption: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    captionMax: {
      color: colors.accent,
      fontWeight: '600',
    },
  });
}

/**
 * Thin segment bar toward the next solo success level (offline training only).
 */
export function TrainingProgressBar({
  wordCount,
  lexiconMax,
  showUnlockHint = false,
  embedded = false,
  showLevelLabel = true,
}: TrainingProgressBarProps) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const segment = resolveSuccessBarSegment(wordCount, lexiconMax);
  const medal = soloSuccessMedal(segment.levelId);
  const levelTitle =
    segment.levelId === 'none'
      ? null
      : t(LEVEL_TITLE_KEYS[segment.levelId as Exclude<SoloSuccessLevelId, 'none'>]);
  const leftLabel =
    segment.levelId === 'none' ? '—' : medal ? `${medal} ${levelTitle}` : (levelTitle ?? '—');

  let caption: string;
  if (segment.levelId === 'none') {
    caption = t('soloSuccess.firstWord');
  } else if (segment.nextLevelId == null) {
    caption = t('soloSuccess.championMax');
  } else {
    const nextTitle = t(
      LEVEL_TITLE_KEYS[segment.nextLevelId as Exclude<SoloSuccessLevelId, 'none'>],
    );
    caption = t('soloSuccess.nextLevel', {
      title: nextTitle,
      count: segment.wordsToNext,
      wordForm: ukWordForm(segment.wordsToNext),
    });
  }

  if (showUnlockHint) {
    const unlockRemaining = wordsUntilTrainingUnlock(wordCount, lexiconMax);
    if (unlockRemaining > 0) {
      caption += t('soloSuccess.unlockSuffix', {
        count: unlockRemaining,
        wordForm: ukWordForm(unlockRemaining),
      });
    }
  }

  return (
    <View style={[styles.wrap, embedded ? styles.wrapEmbedded : null]}>
      <View style={styles.row}>
        {showLevelLabel ? (
          <Text style={styles.label} numberOfLines={1}>
            {leftLabel}
          </Text>
        ) : null}
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${segment.fill01 * 100}%` }]} />
        </View>
      </View>
      <Text
        style={[styles.caption, segment.nextLevelId == null ? styles.captionMax : null]}
        numberOfLines={2}
      >
        {caption}
      </Text>
    </View>
  );
}
