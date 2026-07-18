type AndroidProvider = 'playIntegrity' | 'debug';
type AppleProvider = 'appAttestWithDeviceCheckFallback' | 'debug';

export interface NativeAppCheckProviderConfig {
  android: { provider: AndroidProvider; debugToken?: string };
  apple: { provider: AppleProvider; debugToken?: string };
}

/** Pure provider options — unit-tested so debugToken never rides with production providers. */
export function buildNativeAppCheckProviderConfig(
  production: boolean,
  debugToken?: string | null,
): NativeAppCheckProviderConfig {
  const token = debugToken?.trim();
  const debugOpts = !production && token ? { debugToken: token } : {};
  return {
    android: {
      provider: production ? 'playIntegrity' : 'debug',
      ...debugOpts,
    },
    apple: {
      provider: production ? 'appAttestWithDeviceCheckFallback' : 'debug',
      ...debugOpts,
    },
  };
}
