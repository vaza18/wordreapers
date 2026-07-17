import { expireTimeMillisFromAppCheckJwt } from './app-check-token-expiry.js';
import type { NativeAppCheckTokenGetter } from './native-app-check-native.js';

/**
 * Resolve a non-empty App Check token from native attestation (with one force-refresh retry).
 * Throws instead of returning an empty token (empty tokens show as Console "Invalid").
 */
export async function resolveNativeAppCheckTokenForJsSdk(
  nativeAppCheck: unknown,
  getNativeAppCheckToken: NativeAppCheckTokenGetter,
): Promise<{ token: string; expireTimeMillis: number }> {
  let result = await getNativeAppCheckToken(nativeAppCheck, false);
  if (!result.token) {
    result = await getNativeAppCheckToken(nativeAppCheck, true);
  }
  if (!result.token) {
    throw new Error('APP_CHECK_TOKEN_EMPTY');
  }
  return {
    token: result.token,
    expireTimeMillis: expireTimeMillisFromAppCheckJwt(result.token),
  };
}
