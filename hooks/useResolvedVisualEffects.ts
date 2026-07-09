import { useMemo } from 'react';

import { useReduceMotion } from '@/hooks/useReduceMotion';
import {
  resolveVisualEffects,
  type ResolvedVisualEffects,
  type VisualEffectsPreferences,
} from '@/lib/settings/visual-effects';
import { useSettingsStore } from '@/store/settings-store';

/** App visual-effects flags after mode, toggles, and OS Reduce Motion. */
export function useResolvedVisualEffects(): ResolvedVisualEffects {
  const visualEffects = useSettingsStore((state) => state.visualEffects);
  const osReduceMotion = useReduceMotion();

  return useMemo(
    () => resolveVisualEffects(visualEffects, osReduceMotion),
    [visualEffects, osReduceMotion],
  );
}

/** Resolved flags from explicit prefs (for tests and non-React callers). */
export function resolveVisualEffectsFromPrefs(
  prefs: VisualEffectsPreferences,
  osReduceMotion: boolean | null,
): ResolvedVisualEffects {
  return resolveVisualEffects(prefs, osReduceMotion);
}
