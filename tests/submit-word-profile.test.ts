import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSubmitWordProfile } from '../lib/online/submit-word-profile.js';

describe('submit-word-profile', () => {
  beforeEach(() => {
    vi.stubGlobal('__DEV__', true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('performance', {
      now: vi
        .fn()
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(5)
        .mockReturnValueOnce(12)
        .mockReturnValueOnce(20),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns null outside dev builds', () => {
    vi.stubGlobal('__DEV__', false);
    expect(createSubmitWordProfile('порт')).toBeNull();
  });

  it('records segment marks and logs total latency in dev', () => {
    const profile = createSubmitWordProfile('порт');
    expect(profile).not.toBeNull();

    profile?.mark('validate');
    profile?.finish();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[submitWord порт]'),
      expect.any(String),
    );
  });

  it('ignores repeated finish calls (listener + remoteDone race)', () => {
    const profile = createSubmitWordProfile('порт');
    expect(profile).not.toBeNull();

    profile?.mark('validate');
    profile?.finish();
    profile?.finish();

    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it('flushes rolling latency summary in dev', async () => {
    vi.resetModules();
    const { createSubmitWordProfile, flushSubmitLatencySummary } =
      await import('../lib/online/submit-word-profile.js');
    const profile = createSubmitWordProfile('порт');
    profile?.finish();
    flushSubmitLatencySummary();
    expect(console.log).toHaveBeenCalled();
  });
});
