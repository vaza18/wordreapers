import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeApplicationVersion = vi.hoisted(() => ({ value: '1.2.0' as string | null }));
const nativeBuildVersion = vi.hoisted(() => ({ value: '1' as string | null }));
const expoConfigVersion = vi.hoisted(() => ({ value: '1.2.4' as string | null | undefined }));

vi.mock('expo-application', () => ({
  get nativeApplicationVersion() {
    return nativeApplicationVersion.value;
  },
  get nativeBuildVersion() {
    return nativeBuildVersion.value;
  },
}));

vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return expoConfigVersion.value == null ? undefined : { version: expoConfigVersion.value };
    },
  },
}));

import { getAppVersionInfo, shouldShowBuildNumber } from '../lib/app-version.js';

describe('getAppVersionInfo', () => {
  beforeEach(() => {
    vi.stubGlobal('__DEV__', true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    nativeApplicationVersion.value = '1.2.0';
    nativeBuildVersion.value = '1';
    expoConfigVersion.value = '1.2.4';
  });

  it('prefers app.json version over stale native dev-client metadata', () => {
    expect(getAppVersionInfo()).toEqual({ version: '1.2.4', build: null });
  });

  it('falls back to native version when app config is missing', () => {
    expoConfigVersion.value = undefined;
    expect(getAppVersionInfo()).toEqual({ version: '1.2.0', build: null });
  });

  it('includes native build number outside development', () => {
    vi.stubGlobal('__DEV__', false);
    nativeBuildVersion.value = '12';

    expect(getAppVersionInfo()).toEqual({ version: '1.2.4', build: '12' });
  });
});

describe('shouldShowBuildNumber', () => {
  it('shows build when it differs from version', () => {
    expect(shouldShowBuildNumber('1.2.4', '12')).toBe(true);
  });

  it('hides build when it matches version', () => {
    expect(shouldShowBuildNumber('1.2.4', '1.2.4')).toBe(false);
  });
});
