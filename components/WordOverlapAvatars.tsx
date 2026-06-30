import { AvatarTooltipRow } from '@/components/AvatarTooltipRow';
import type { WordOverlapPeer } from '@/lib/game/word-overlap-peers';

interface WordOverlapAvatarsProps {
  peers: readonly WordOverlapPeer[];
}

/** Avatars of players who submitted the same word; tap for a floating name tooltip. */
export function WordOverlapAvatars({ peers }: WordOverlapAvatarsProps) {
  return <AvatarTooltipRow mode="peers" peers={peers} />;
}
