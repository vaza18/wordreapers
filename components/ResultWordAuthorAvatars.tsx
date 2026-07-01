import { AvatarTooltipRow } from '@/components/AvatarTooltipRow';
import type { GlobalWordAuthor } from '@/lib/game/results-view';

interface ResultWordAuthorAvatarsProps {
  authors: readonly GlobalWordAuthor[];
  showUniqueBadge?: boolean;
}

/** Compact author row for results «Всі слова» — avatars, «+N», tap for names. */
export function ResultWordAuthorAvatars({
  authors,
  showUniqueBadge = false,
}: ResultWordAuthorAvatarsProps) {
  return <AvatarTooltipRow mode="authors" authors={authors} showUniqueBadge={showUniqueBadge} />;
}
