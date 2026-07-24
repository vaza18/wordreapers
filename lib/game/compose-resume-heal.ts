import type { AppStateStatus } from 'react-native';

/**
 * After iOS lock / multi-sim focus, native-driver fly + press animations and
 * JS timer ticks can stall while touch handlers and RTDB writes still run.
 * Foreground (`active`) is the heal point for compose visuals and clocks.
 */
export function shouldHealPlayUiOnAppState(next: AppStateStatus): boolean {
  return next === 'active';
}

/**
 * Prefer a resume fetch when remote already has words the local map is missing
 * (submit committed while the UI paint / listener was stalled).
 */
export function shouldReplaceOwnWordsFromResumeSnapshot(options: {
  localNormalized: ReadonlySet<string>;
  remoteNormalized: ReadonlySet<string>;
}): boolean {
  const { localNormalized, remoteNormalized } = options;
  if (remoteNormalized.size > localNormalized.size) {
    return true;
  }
  for (const key of remoteNormalized) {
    if (!localNormalized.has(key)) {
      return true;
    }
  }
  return false;
}
