import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { OnlinePlayComposePanel } from '@/components/online/OnlinePlayComposePanel';
import { OnlinePlayWordListSection } from '@/components/online/OnlinePlayWordListSection';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import type { PlayWordFeedbackVariant } from '@/lib/game/play-word-feedback';
import type { LetterKey } from '@/lib/game/letter-keyboard';
import type { ScoredWordEntry } from '@/lib/game/scoring';
import type { WordOverlapPeer } from '@/lib/game/word-overlap-peers';

export type OnlinePlayActiveBodyProps = {
  myName: string;
  playRulesLabel: string;
  entries: readonly (ScoredWordEntry & { overlapPeers?: readonly WordOverlapPeer[] })[];
  displays: readonly string[];
  draft: string;
  draftKeyIndices: readonly number[];
  letterKeys: readonly LetterKey[];
  scrollToNormalized: string | null;
  scrollToRequestId: number | undefined;
  feedback: string | null;
  feedbackVariant: PlayWordFeedbackVariant;
  backgroundSyncing: boolean;
  showScoreBadges: boolean;
  showOverlapPeers: boolean;
  onPressKey: (index: number) => void;
  onClearDraft: () => void;
  onBackspaceDraft: () => void;
};

/**
 * Player header, word list, and compose panel — kept separate from the ticking timer header.
 */
export const OnlinePlayActiveBody = memo(function OnlinePlayActiveBody({
  myName,
  playRulesLabel,
  entries,
  displays,
  draft,
  draftKeyIndices,
  letterKeys,
  scrollToNormalized,
  scrollToRequestId,
  feedback,
  feedbackVariant,
  backgroundSyncing,
  showScoreBadges,
  showOverlapPeers,
  onPressKey,
  onClearDraft,
  onBackspaceDraft,
}: OnlinePlayActiveBodyProps) {
  const styles = useThemedStyles(createStyles);

  return (
    <>
      <View style={styles.playerHeader}>
        <Text style={styles.playerName} numberOfLines={1}>
          {myName}
        </Text>
        <Text style={styles.playRules} numberOfLines={2}>
          {playRulesLabel}
        </Text>
      </View>

      <OnlinePlayWordListSection
        entries={entries}
        displays={displays}
        draftPrefix={draft}
        scrollToNormalized={scrollToNormalized}
        scrollToRequestId={scrollToRequestId}
        feedback={feedback}
        feedbackVariant={feedbackVariant}
        backgroundSyncing={backgroundSyncing}
        showScoreBadges={showScoreBadges}
        showOverlapPeers={showOverlapPeers}
      />

      <OnlinePlayComposePanel
        draft={draft}
        draftKeyIndices={draftKeyIndices}
        letterKeys={letterKeys}
        onPressKey={onPressKey}
        onClearDraft={onClearDraft}
        onBackspaceDraft={onBackspaceDraft}
      />
    </>
  );
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    playerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    playerName: {
      flexShrink: 1,
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    playRules: {
      flex: 1,
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'right',
    },
  });
}
