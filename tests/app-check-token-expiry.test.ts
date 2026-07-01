import { describe, expect, it } from 'vitest';

import { expireTimeMillisFromAppCheckJwt } from '../lib/firebase/app-check-token-expiry.js';

function jwtWithExp(expSeconds: number): string {
  const header = globalThis.btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = globalThis.btoa(JSON.stringify({ exp: expSeconds }));
  return `${header}.${payload}.sig`;
}

describe('expireTimeMillisFromAppCheckJwt', () => {
  it('reads exp from JWT payload', () => {
    const token = jwtWithExp(1_700_000_000);
    expect(expireTimeMillisFromAppCheckJwt(token)).toBe(1_700_000_000_000);
  });

  it('falls back when token is not a JWT', () => {
    const now = 1_000_000;
    expect(expireTimeMillisFromAppCheckJwt('not-a-jwt', now)).toBe(now + 55 * 60 * 1000);
  });
});
