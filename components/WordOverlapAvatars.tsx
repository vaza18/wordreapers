import {
  createRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type Component,
  type RefObject,
} from 'react';
import { StyleSheet, Text, View, type View as RNView } from 'react-native';
import Popover, { PopoverPlacement } from 'react-native-popover-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { playerAvatarColors } from '@/constants/player-avatars';
import { radii, spacing } from '@/constants/theme';
import type { WordOverlapPeer } from '@/lib/game/word-overlap-peers';
import {
  dismissWordOverlapTooltips,
  subscribeWordOverlapTooltipDismiss,
} from '@/lib/ui/word-overlap-tooltip';

const AVATAR_SIZE = 22;
const TOOLTIP_EDGE_PADDING = spacing.md;
const TOOLTIP_GAP = 4;

interface WordOverlapAvatarsProps {
  peers: readonly WordOverlapPeer[];
}

function getAnchorRef(
  refs: Map<string, RefObject<RNView | null>>,
  playerId: string,
): RefObject<RNView | null> {
  const existing = refs.get(playerId);
  if (existing) {
    return existing;
  }
  const created = createRef<RNView>();
  refs.set(playerId, created);
  return created;
}

/**
 * Avatars of players who submitted the same word; tap for a floating name tooltip.
 */
export function WordOverlapAvatars({ peers }: WordOverlapAvatarsProps) {
  const insets = useSafeAreaInsets();
  const [revealedPlayerId, setRevealedPlayerId] = useState<string | null>(null);
  const anchorRefs = useRef(new Map<string, RefObject<RNView | null>>());

  const hideTooltip = useCallback(() => {
    setRevealedPlayerId(null);
  }, []);

  useEffect(() => {
    return subscribeWordOverlapTooltipDismiss(hideTooltip);
  }, [hideTooltip]);

  const toggleTooltip = useCallback(
    (peer: WordOverlapPeer) => {
      if (revealedPlayerId === peer.playerId) {
        hideTooltip();
        return;
      }
      dismissWordOverlapTooltips();
      setRevealedPlayerId(peer.playerId);
    },
    [hideTooltip, revealedPlayerId],
  );

  if (peers.length === 0) {
    return null;
  }

  return (
    <View style={styles.avatars}>
      {peers.map((peer) => {
        const anchorRef = getAnchorRef(anchorRefs.current, peer.playerId);
        const palette = playerAvatarColors(peer.avatarColorIndex);
        const isVisible = revealedPlayerId === peer.playerId;

        return (
          <View key={peer.playerId} style={styles.avatarSlot}>
            <View ref={anchorRef} collapsable={false} style={styles.avatarAnchor}>
              <FeedbackPressable
                accessibilityRole="button"
                accessibilityLabel={peer.name}
                onPress={() => {
                  toggleTooltip(peer);
                }}
                style={styles.avatarButton}
              >
                <PlayerAvatar
                  name={peer.name}
                  avatarColorIndex={peer.avatarColorIndex}
                  size={AVATAR_SIZE}
                />
              </FeedbackPressable>
            </View>

            <Popover
              from={anchorRef as RefObject<Component>}
              isVisible={isVisible}
              onRequestClose={hideTooltip}
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
              <Text style={[styles.tooltipText, { color: palette.color }]} numberOfLines={3}>
                {peer.name}
              </Text>
            </Popover>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  avatars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  avatarSlot: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  avatarAnchor: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  avatarButton: {
    borderRadius: AVATAR_SIZE / 2,
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
});
