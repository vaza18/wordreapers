import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockExtra = vi.hoisted(() => ({
  current: {} as { firebaseAppCheckProduction?: boolean },
}));

vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return { extra: mockExtra.current };
    },
  },
}));

describe('useProductionAppCheckProviders', () => {
  beforeEach(() => {
    mockExtra.current = {};
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns true when EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION is true', async () => {
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION', 'true');
    const { useProductionAppCheckProviders } = await import('../lib/firebase/app-check-mode.js');
    expect(useProductionAppCheckProviders()).toBe(true);
  });

  it('returns false when override is false', async () => {
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION', 'false');
    mockExtra.current = { firebaseAppCheckProduction: true };
    const { useProductionAppCheckProviders } = await import('../lib/firebase/app-check-mode.js');
    expect(useProductionAppCheckProviders()).toBe(false);
  });

  it('defaults to false when neither env nor expo.extra is set', async () => {
    vi.stubEnv('APP_VARIANT', 'production');
    vi.stubEnv('EAS_BUILD_PROFILE', 'production');
    const { useProductionAppCheckProviders } = await import('../lib/firebase/app-check-mode.js');
    expect(useProductionAppCheckProviders()).toBe(false);
  });

  it('ignores non true/false override values like auto and falls through to expo.extra', async () => {
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION', 'auto');
    mockExtra.current = { firebaseAppCheckProduction: true };
    const { useProductionAppCheckProviders } = await import('../lib/firebase/app-check-mode.js');
    expect(useProductionAppCheckProviders()).toBe(true);
  });

  it('uses expo.extra.firebaseAppCheckProduction when env override is absent', async () => {
    mockExtra.current = { firebaseAppCheckProduction: true };
    const { useProductionAppCheckProviders } = await import('../lib/firebase/app-check-mode.js');
    expect(useProductionAppCheckProviders()).toBe(true);

    mockExtra.current = { firebaseAppCheckProduction: false };
    expect(useProductionAppCheckProviders()).toBe(false);
  });
});
