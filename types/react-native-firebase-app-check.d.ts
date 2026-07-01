/** Minimal typings for dynamic native App Check (package types are not always resolved by the IDE). */
declare module '@react-native-firebase/app-check' {
  export class ReactNativeFirebaseAppCheckProvider {
    configure(options: {
      android: { provider: string; debugToken?: string };
      apple: { provider: string; debugToken?: string };
    }): void;
  }

  export function initializeAppCheck(
    app: unknown,
    options: {
      provider: ReactNativeFirebaseAppCheckProvider;
      isTokenAutoRefreshEnabled?: boolean;
    },
  ): Promise<unknown>;

  export function getToken(
    appCheckInstance: unknown,
    forceRefresh?: boolean,
  ): Promise<{ token: string }>;
}

declare module '@react-native-firebase/app' {
  export function getApp(): unknown;
}
