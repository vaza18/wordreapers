import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { OnlinePlayComposePanel } from '@/components/online/OnlinePlayComposePanel';
import { OnlinePlayWordListSection } from '@/components/online/OnlinePlayWordListSection';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import type { PlayWordFeedbackVariant } from '@/lib/game/play-word-feedback';
import type { LetterKey } from '@/lib/game/letter-keyboard';
import type { ScoredWordEntry } from '@/lib/game/scoring';
import type { WordOverlapPeer } from '@/lib/game/word-overlap-peers';
import { PREFIX_SCROLL_DEBOUNCE_MS } from '@/lib/ui/word-list-scroll-behavior';

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
  /** Hide play-rules row when label is empty (solo setup). */
  hideEmptyPlayRules?: boolean;
  /** Shown under the word list when solo publish fails. */
  publishError?: string | null;
  onPressKey: (index: number) => void;
  onClearDraft: () => void;
  onBackspaceDraft: () => void;
};

/**
 * Player header, word list, and compose panel — kept separate from the ticking timer header.
 * Debounces `draftPrefix` so FlatList prefix work does not run on every keystroke.
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
  hideEmptyPlayRules = false,
  publishError = null,
  onPressKey,
  onClearDraft,
  onBackspaceDraft,
}: OnlinePlayActiveBodyProps) {
  const styles = useThemedStyles(createStyles);
  const wordListDraftPrefix = useDebouncedValue(draft, PREFIX_SCROLL_DEBOUNCE_MS, {
    flushEmpty: true,
  });

  return (
    <>
      <View style={styles.playerHeader}>
        <Text style={styles.playerName} numberOfLines={1}>
          {myName}
        </Text>
        {!hideEmptyPlayRules || playRulesLabel ? (
          <Text style={styles.playRules} numberOfLines={2}>
            {playRulesLabel}
          </Text>
        ) : null}
      </View>

      <View style={styles.wordListOuter}>
        <OnlinePlayWordListSection
          entries={entries}
          displays={displays}
          draftPrefix={wordListDraftPrefix}
          scrollToNormalized={scrollToNormalized}
          scrollToRequestId={scrollToRequestId}
          feedback={feedback}
          feedbackVariant={feedbackVariant}
          backgroundSyncing={backgroundSyncing}
          showScoreBadges={showScoreBadges}
          showOverlapPeers={showOverlapPeers}
        />
        {publishError ? <Text style={styles.publishError}>{publishError}</Text> : null}
      </View>

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
    wordListOuter: {
      flex: 1,
      minHeight: 0,
    },
    publishError: {
      fontSize: 13,
      color: '#E24B4A',
      marginTop: spacing.xs,
      textAlign: 'center',
    },
  });
}
