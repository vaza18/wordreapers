import { describe, expect, it } from 'vitest';

import { buildNativeAppCheckProviderConfig } from '../lib/firebase/native-app-check-provider-config.js';

describe('buildNativeAppCheckProviderConfig', () => {
  it('uses Play Integrity / App Attest without debugToken in production', () => {
    expect(buildNativeAppCheckProviderConfig(true, 'DEBUG-TOKEN')).toEqual({
      android: { provider: 'playIntegrity' },
      apple: { provider: 'appAttestWithDeviceCheckFallback' },
    });
  });

  it('attaches debugToken only for the debug provider', () => {
    expect(buildNativeAppCheckProviderConfig(false, 'DEBUG-TOKEN')).toEqual({
      android: { provider: 'debug', debugToken: 'DEBUG-TOKEN' },
      apple: { provider: 'debug', debugToken: 'DEBUG-TOKEN' },
    });
  });

  it('omits debugToken when absent in debug mode', () => {
    expect(buildNativeAppCheckProviderConfig(false, '  ')).toEqual({
      android: { provider: 'debug' },
      apple: { provider: 'debug' },
    });
  });
});
