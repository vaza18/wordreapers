import { afterEach, describe, expect, it, vi } from 'vitest';

import { useProductionAppCheckProviders } from '../lib/firebase/app-check-mode.js';

describe('useProductionAppCheckProviders', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true when EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION is true', () => {
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION', 'true');
    expect(useProductionAppCheckProviders()).toBe(true);
  });

  it('returns false when override is false', () => {
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION', 'false');
    vi.stubEnv('APP_VARIANT', 'production');
    expect(useProductionAppCheckProviders()).toBe(false);
  });

  it('returns true for production release profile when not in dev bundle', () => {
    vi.stubEnv('APP_VARIANT', 'production');
    expect(useProductionAppCheckProviders()).toBe(true);
  });
});
