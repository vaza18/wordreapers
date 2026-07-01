import {
  createRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type Component,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View, type View as RNView } from 'react-native';
import Popover, { PopoverPlacement } from 'react-native-popover-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { playerAvatarColors, playerAvatarSwatch } from '@/constants/player-avatars';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useCompactAvatarLayout } from '@/hooks/useCompactAvatarLayout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import type { GlobalWordAuthor } from '@/lib/game/results-view';
import type { WordOverlapPeer } from '@/lib/game/word-overlap-peers';
import { splitResultWordAuthors } from '@/lib/ui/result-word-authors';
import {
  dismissWordOverlapTooltips,
  subscribeWordOverlapTooltipDismiss,
} from '@/lib/ui/word-overlap-tooltip';

const AVATAR_SIZE = 22;
const OVERFLOW_LIST_MAX_HEIGHT = 220;
const TOOLTIP_EDGE_PADDING = spacing.md;
const TOOLTIP_GAP = 4;

type RevealState = { kind: 'person'; id: string } | { kind: 'overflow' } | null;

type AvatarPerson = {
  id: string;
  name: string;
  avatarColorIndex: number;
  uniqueSuffix?: string;
};

type AvatarTooltipRowProps =
  | { mode: 'peers'; peers: readonly WordOverlapPeer[] }
  | {
      mode: 'authors';
      authors: readonly GlobalWordAuthor[];
      showUniqueBadge?: boolean;
    };

function getAnchorRef(
  refs: Map<string, RefObject<RNView | null>>,
  key: string,
): RefObject<RNView | null> {
  const existing = refs.get(key);
  if (existing) {
    return existing;
  }
  const created = createRef<RNView>();
  refs.set(key, created);
  return created;
}

function AuthorNameLine({
  author,
  showUniqueBadge,
}: {
  author: GlobalWordAuthor;
  showUniqueBadge: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const swatch = playerAvatarSwatch(author.avatarColorIndex);

  return (
    <View style={styles.overflowRow}>
      <PlayerAvatar name={author.playerName} avatarColorIndex={author.avatarColorIndex} size={18} />
      <Text style={[styles.overflowName, { color: swatch }]} numberOfLines={2}>
        {author.playerName}
      </Text>
      {showUniqueBadge && author.kind === 'unique' ? (
        <Text style={styles.overflowX2}>x2</Text>
      ) : null}
    </View>
  );
}

function AvatarTooltipPopover({
  anchorRef,
  visible,
  onClose,
  palette,
  children,
}: {
  anchorRef: RefObject<RNView | null>;
  visible: boolean;
  onClose: () => void;
  palette: ReturnType<typeof playerAvatarColors>;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);

  return (
    <Popover
      from={anchorRef as RefObject<Component>}
      isVisible={visible}
      onRequestClose={onClose}
      placement={PopoverPlacement.AUTO}
      offset={TOOLTIP_GAP}
      arrowSize={{ width: 12, height: 6 }}
      backgroundStyle={styles.popoverBackdrop}
      popoverStyle={[
        styles.popoverBubble,
        {
          backgroundColor: palette.background,
          borderColor: 'rgba(0, 0, 0, 0.18)',
        },
      ]}
      displayAreaInsets={{
        top: insets.top + spacing.xs,
        bottom: insets.bottom + spacing.xs,
        left: TOOLTIP_EDGE_PADDING,
        right: TOOLTIP_EDGE_PADDING,
      }}
      statusBarTranslucent
    >
      {children}
    </Popover>
  );
}

/**
 * Compact avatar row with tap-to-reveal name tooltips (play overlap peers or results authors).
 */
export function AvatarTooltipRow(props: AvatarTooltipRowProps) {
  const styles = useThemedStyles(createStyles);
  const avatarLayout = useCompactAvatarLayout(AVATAR_SIZE);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [reveal, setReveal] = useState<RevealState>(null);
  const anchorRefs = useRef(new Map<string, RefObject<RNView | null>>());
  const overflowAnchorRef = useRef<RNView | null>(null);

  const showUniqueBadge = props.mode === 'authors' ? (props.showUniqueBadge ?? false) : false;

  const { visiblePeople, overflowAuthors } = (() => {
    if (props.mode === 'peers') {
      const people: AvatarPerson[] = props.peers.map((peer) => ({
        id: peer.playerId,
        name: peer.name,
        avatarColorIndex: peer.avatarColorIndex,
      }));
      return { visiblePeople: people, overflowAuthors: [] as GlobalWordAuthor[] };
    }
    const { visible, overflow } = splitResultWordAuthors(props.authors);
    const people: AvatarPerson[] = visible.map((author) => ({
      id: author.playerId,
      name: author.playerName,
      avatarColorIndex: author.avatarColorIndex,
      uniqueSuffix: showUniqueBadge && author.kind === 'unique' ? ' · x2' : '',
    }));
    return { visiblePeople: people, overflowAuthors: overflow };
  })();

  const hideReveal = useCallback(() => {
    setReveal(null);
  }, []);

  useEffect(() => {
    return subscribeWordOverlapTooltipDismiss(hideReveal);
  }, [hideReveal]);

  const openPerson = useCallback(
    (personId: string) => {
      if (reveal?.kind === 'person' && reveal.id === personId) {
        hideReveal();
        return;
      }
      dismissWordOverlapTooltips();
      setReveal({ kind: 'person', id: personId });
    },
    [hideReveal, reveal],
  );

  const openOverflow = useCallback(() => {
    if (reveal?.kind === 'overflow') {
      hideReveal();
      return;
    }
    dismissWordOverlapTooltips();
    setReveal({ kind: 'overflow' });
  }, [hideReveal, reveal]);

  if (visiblePeople.length === 0 && overflowAuthors.length === 0) {
    return null;
  }

  return (
    <View style={[styles.row, { gap: avatarLayout.gap }]}>
      {visiblePeople.map((person) => {
        const anchorRef = getAnchorRef(anchorRefs.current, person.id);
        const palette = playerAvatarColors(person.avatarColorIndex);
        const isVisible = reveal?.kind === 'person' && reveal.id === person.id;
        const slotSize = avatarLayout.diameter;

        return (
          <View key={person.id} style={[styles.avatarSlot, { width: slotSize, height: slotSize }]}>
            <View
              ref={anchorRef}
              collapsable={false}
              style={[styles.avatarAnchor, { width: slotSize, height: slotSize }]}
            >
              <FeedbackPressable
                accessibilityRole="button"
                accessibilityLabel={person.name}
                onPress={() => {
                  openPerson(person.id);
                }}
                style={[styles.avatarButton, { borderRadius: slotSize / 2 }]}
              >
                <PlayerAvatar
                  name={person.name}
                  avatarColorIndex={person.avatarColorIndex}
                  size={AVATAR_SIZE}
                />
              </FeedbackPressable>
            </View>

            <AvatarTooltipPopover
              anchorRef={anchorRef}
              visible={isVisible}
              onClose={hideReveal}
              palette={palette}
            >
              <Text style={[styles.tooltipText, { color: palette.color }]} numberOfLines={3}>
                {person.name}
                {person.uniqueSuffix ?? ''}
              </Text>
            </AvatarTooltipPopover>
          </View>
        );
      })}

      {overflowAuthors.length > 0 ? (
        <View style={[styles.overflowSlot, { height: avatarLayout.diameter }]}>
          <View
            ref={overflowAnchorRef}
            collapsable={false}
            style={[styles.avatarAnchor, styles.overflowAnchor]}
          >
            <FeedbackPressable
              accessibilityRole="button"
              accessibilityLabel={t('game.resultsAuthorsOverflow', {
                count: overflowAuthors.length,
              })}
              onPress={openOverflow}
              style={[
                styles.overflowButton,
                {
                  minWidth: avatarLayout.diameter,
                  height: avatarLayout.diameter,
                  borderRadius: avatarLayout.diameter / 2,
                },
              ]}
            >
              <Text style={styles.overflowLabel}>+{overflowAuthors.length}</Text>
            </FeedbackPressable>
          </View>

          <Popover
            from={overflowAnchorRef as RefObject<Component>}
            isVisible={reveal?.kind === 'overflow'}
            onRequestClose={hideReveal}
            placement={PopoverPlacement.AUTO}
            offset={TOOLTIP_GAP}
            arrowSize={{ width: 12, height: 6 }}
            backgroundStyle={styles.popoverBackdrop}
            popoverStyle={styles.overflowPopover}
            displayAreaInsets={{
              top: insets.top + spacing.xs,
              bottom: insets.bottom + spacing.xs,
              left: TOOLTIP_EDGE_PADDING,
              right: TOOLTIP_EDGE_PADDING,
            }}
            statusBarTranslucent
          >
            <ScrollView
              style={styles.overflowScroll}
              contentContainerStyle={styles.overflowScrollContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {overflowAuthors.map((author) => (
                <AuthorNameLine
                  key={author.playerId}
                  author={author}
                  showUniqueBadge={showUniqueBadge}
                />
              ))}
            </ScrollView>
          </Popover>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatarSlot: {},
    avatarAnchor: {},
    avatarButton: {},
    overflowSlot: {
      justifyContent: 'center',
    },
    overflowAnchor: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    overflowButton: {
      paddingHorizontal: 4,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderTertiary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    overflowLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    popoverBackdrop: {
      backgroundColor: 'rgba(0, 0, 0, 0.12)',
    },
    popoverBubble: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 5,
      borderRadius: radii.sm,
      borderWidth: 1,
      maxWidth: 280,
    },
    tooltipText: {
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
    },
    overflowPopover: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.xs,
      borderRadius: radii.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderTertiary,
      backgroundColor: colors.notebookPaper,
      maxWidth: 280,
    },
    overflowScroll: {
      maxHeight: OVERFLOW_LIST_MAX_HEIGHT,
    },
    overflowScrollContent: {
      gap: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    overflowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: 2,
    },
    overflowName: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
    },
    overflowX2: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.accent,
    },
  });
}
