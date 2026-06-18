import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { WordOverlapAvatars } from '@/components/WordOverlapAvatars';
import { colors, radii, spacing } from '@/constants/theme';
import type { PlayerResultRankGroup } from '@/lib/game/results-view';

interface ResultsByPlayerProps {
  rankGroups: readonly PlayerResultRankGroup[];
  pointsShort: string;
  wordsShort: string;
  youLabel: string;
  highlightPlayerId: string | null;
  defaultExpandedPlayerId: string | null;
  showScores?: boolean;
  showWordsPerMinute?: boolean;
}

/**
 * «По гравцях» tab — rank tiers; tied players sit on the same level (TZ §3.5).
 */
export function ResultsByPlayer({
  rankGroups,
  pointsShort,
  wordsShort,
  youLabel,
  highlightPlayerId,
  defaultExpandedPlayerId,
  showScores = true,
  showWordsPerMinute = false,
}: ResultsByPlayerProps) {
  const { t } = useTranslation();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (defaultExpandedPlayerId) {
      initial.add(defaultExpandedPlayerId);
    }
    return initial;
  });

  const toggle = (playerId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  return (
    <View style={styles.list}>
      {rankGroups.map((group) => {
        const multi = group.players.length > 1;
        const rep = group.players[0];
        const tierStyle = [
          styles.tier,
          group.isTopRank ? styles.tierTop : null,
          multi ? styles.tierMulti : null,
        ];

        return (
          <View key={`rank-${group.rank}`} style={tierStyle}>
            {multi ? (
              <Text style={[styles.tierLabel, group.isTopRank ? styles.tierLabelTop : null]}>
                {t('game.resultsRankTier', {
                  rank: group.rank,
                  score: rep?.score ?? 0,
                  words: rep?.wordCount ?? 0,
                })}
              </Text>
            ) : null}

            <View style={[styles.playersRow, multi ? styles.playersRowMulti : null]}>
              {group.players.map((section) => {
                const expanded = expandedIds.has(section.playerId);
                const isYou = highlightPlayerId === section.playerId;
                const cardStyle = [
                  styles.card,
                  multi ? styles.cardInRow : null,
                  isYou ? styles.cardYou : null,
                ];

                return (
                  <View key={section.playerId} style={cardStyle}>
                    <FeedbackPressable
                      accessibilityRole="button"
                      onPress={() => {
                        toggle(section.playerId);
                      }}
                      style={styles.header}
                    >
                      <View style={styles.headerLeft}>
                        <PlayerAvatar
                          avatarColorIndex={section.avatarColorIndex}
                          name={section.playerName}
                          size={22}
                        />
                        <Text
                          style={[styles.name, isYou ? styles.nameYou : null]}
                          numberOfLines={1}
                        >
                          {multi ? section.playerName : `${section.rank}. ${section.playerName}`}
                          {isYou ? ` ${youLabel}` : ''}
                        </Text>
                      </View>
                      <Text style={styles.meta}>
                        {showScores ? (
                          <>
                            {section.score}
                            {pointsShort} ·{' '}
                          </>
                        ) : null}
                        {section.wordCount}
                        {wordsShort}
                        {showWordsPerMinute && section.wordsPerMinute != null ? (
                          <>
                            {' · '}
                            {t('game.resultsWordsPerMinuteShort', {
                              rate: section.wordsPerMinute,
                            })}
                          </>
                        ) : null}{' '}
                        {expanded ? '▲' : '▼'}
                      </Text>
                    </FeedbackPressable>
                    {expanded ? (
                      <View style={styles.wordsRow}>
                        {section.words.map((word, index) => (
                          <View
                            key={`${section.playerId}-${word.display}`}
                            style={styles.wordChipWrap}
                          >
                            {index > 0 ? <Text style={styles.sep}>·</Text> : null}
                            <Text
                              style={[
                                styles.wordChip,
                                word.badge === 'x2' ? styles.wordChipX2 : null,
                              ]}
                            >
                              {word.display}
                              {word.badge === 'x2' ? ` ${word.badge}` : ''}
                            </Text>
                            {word.overlapPeers.length > 0 ? (
                              <WordOverlapAvatars peers={word.overlapPeers} />
                            ) : null}
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  tier: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderTertiary,
    borderRadius: radii.sm,
    padding: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.backgroundPrimary,
  },
  tierTop: {
    backgroundColor: '#FAEEDA',
    borderColor: '#FAC775',
  },
  tierMulti: {
    padding: spacing.sm,
  },
  tierLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  tierLabelTop: {
    color: '#633806',
  },
  playersRow: {
    gap: spacing.xs,
  },
  playersRowMulti: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderTertiary,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundPrimary,
  },
  cardInRow: {
    flex: 1,
    minWidth: 0,
  },
  cardYou: {
    borderColor: '#9FE1CB',
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  nameYou: {
    color: colors.accent,
  },
  meta: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  wordsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: 2,
  },
  wordChipWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sep: {
    fontSize: 12,
    color: colors.textTertiary,
    marginHorizontal: 2,
  },
  wordChip: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  wordChipX2: {
    color: colors.accent,
    fontWeight: '600',
  },
});
