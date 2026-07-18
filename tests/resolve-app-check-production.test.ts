import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { resolveAppCheckProduction } = require('../plugins/resolve-app-check-production.cjs') as {
  resolveAppCheckProduction: (env?: Record<string, string | undefined>) => boolean;
};

describe('resolveAppCheckProduction (plugin)', () => {
  it('is true only for exact "true"', () => {
    expect(resolveAppCheckProduction({ EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION: 'true' })).toBe(
      true,
    );
    expect(resolveAppCheckProduction({ EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION: ' true ' })).toBe(
      true,
    );
  });

  it('is false when unset, false, auto, or only APP_VARIANT is production', () => {
    expect(resolveAppCheckProduction({})).toBe(false);
    expect(resolveAppCheckProduction({ EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION: 'false' })).toBe(
      false,
    );
    expect(resolveAppCheckProduction({ EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION: 'auto' })).toBe(
      false,
    );
    expect(
      resolveAppCheckProduction({
        APP_VARIANT: 'production',
        EAS_BUILD_PROFILE: 'production',
      }),
    ).toBe(false);
  });
});
