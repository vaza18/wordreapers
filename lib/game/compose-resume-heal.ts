import type { AppStateStatus } from 'react-native';

/**
 * After iOS lock / multi-sim focus, native-driver fly + press animations and
 * JS timer ticks can stall while touch handlers and RTDB writes still run.
 * Foreground (`active`) is the heal point for compose visuals and clocks.
 */
export function shouldHealPlayUiOnAppState(next: AppStateStatus): boolean {
  return next === 'active';
}
