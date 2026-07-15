/**
 * Keep WordList row native children in a fixed order so Fabric index maps stay stable.
 * Conditional mount of x2 badge / prefix overlays caused unmount-index crashes on iOS.
 */
export function wordListRowShowsX2Badge(
  showScoreBadges: boolean,
  badge: string | null | undefined,
): boolean {
  return showScoreBadges && badge === 'x2';
}
