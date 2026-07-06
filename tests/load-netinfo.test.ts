import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeLinked = vi.hoisted(() => ({ current: false }));

vi.mock('react-native', () => ({
  NativeModules: {
    get RNCNetInfo() {
      return nativeLinked.current ? {} : undefined;
    },
  },
  Platform: { OS: 'ios' },
}));

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    addEventListener: () => {
      throw new Error('NativeModule.RNCNetInfo is null');
    },
    fetch: vi.fn(),
  },
}));

describe('loadNetInfoClient', () => {
  beforeEach(() => {
    vi.stubGlobal('__DEV__', false);
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    nativeLinked.current = false;
  });

  it('returns null without requiring NetInfo when the native module is missing', async () => {
    nativeLinked.current = false;
    const { loadNetInfoClient } = await import('../lib/network/load-netinfo.js');
    expect(loadNetInfoClient()).toBeNull();
    expect(loadNetInfoClient()).toBeNull();
  });

  it('returns null when addEventListener throws during probe', async () => {
    nativeLinked.current = true;
    const { loadNetInfoClient } = await import('../lib/network/load-netinfo.js');
    expect(loadNetInfoClient()).toBeNull();
  });
});

describe('isNativeNetInfoLinked', () => {
  afterEach(() => {
    vi.resetModules();
    nativeLinked.current = false;
  });

  it('reflects whether RNCNetInfo is present in NativeModules', async () => {
    const { isNativeNetInfoLinked } = await import('../lib/network/load-netinfo.js');
    nativeLinked.current = false;
    expect(isNativeNetInfoLinked()).toBe(false);
    nativeLinked.current = true;
    expect(isNativeNetInfoLinked()).toBe(true);
  });
});
