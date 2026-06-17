import { describe, expect, it, vi } from 'vitest';

import {
  dismissWordOverlapTooltips,
  subscribeWordOverlapTooltipDismiss,
} from '../lib/ui/word-overlap-tooltip.js';

describe('word-overlap-tooltip dismiss registry', () => {
  it('notifies subscribers when dismiss is requested', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeWordOverlapTooltipDismiss(listener);

    dismissWordOverlapTooltips();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    dismissWordOverlapTooltips();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
