import { describe, expect, it, vi } from 'vitest';

import { resolveNativeAppCheckTokenForJsSdk } from '../lib/firebase/app-check-resolve-token.js';

function jwtWithExp(expSeconds: number): string {
  const header = globalThis.btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = globalThis.btoa(JSON.stringify({ exp: expSeconds }));
  return `${header}.${payload}.sig`;
}

describe('resolveNativeAppCheckTokenForJsSdk', () => {
  it('returns token and JWT expiry on first native success', async () => {
    const token = jwtWithExp(1_700_000_000);
    const getNative = vi.fn().mockResolvedValue({ token });

    await expect(resolveNativeAppCheckTokenForJsSdk({}, getNative)).resolves.toEqual({
      token,
      expireTimeMillis: 1_700_000_000_000,
    });
    expect(getNative).toHaveBeenCalledTimes(1);
    expect(getNative).toHaveBeenCalledWith({}, false);
  });

  it('force-refreshes once when the first token is empty', async () => {
    const token = jwtWithExp(1_700_000_000);
    const getNative = vi.fn().mockResolvedValueOnce({ token: '' }).mockResolvedValueOnce({ token });

    await expect(resolveNativeAppCheckTokenForJsSdk({}, getNative)).resolves.toEqual({
      token,
      expireTimeMillis: 1_700_000_000_000,
    });
    expect(getNative).toHaveBeenCalledWith({}, false);
    expect(getNative).toHaveBeenCalledWith({}, true);
  });

  it('throws instead of returning an empty token after retry', async () => {
    const getNative = vi.fn().mockResolvedValue({ token: '' });

    await expect(resolveNativeAppCheckTokenForJsSdk({}, getNative)).rejects.toThrow(
      'APP_CHECK_TOKEN_EMPTY',
    );
    expect(getNative).toHaveBeenCalledTimes(2);
  });
});
