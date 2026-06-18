type DismissListener = () => void;

const listeners = new Set<DismissListener>();

/** Hide any open overlap-player name tooltip (scroll / outside tap). */
export function dismissWordOverlapTooltips(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Register a listener invoked when overlap tooltips should dismiss. */
export function subscribeWordOverlapTooltipDismiss(listener: DismissListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
