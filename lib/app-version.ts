import { nativeApplicationVersion, nativeBuildVersion } from 'expo-application';
import Constants from 'expo-constants';

/** Installed app version and native build number, when available. */
export type AppVersionInfo = {
  version: string | null;
  build: string | null;
};

function readVersionString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** User-facing app version and native build number from the installed binary. */
export function getAppVersionInfo(): AppVersionInfo {
  const version =
    readVersionString(nativeApplicationVersion) ?? readVersionString(Constants.expoConfig?.version);
  const build = readVersionString(nativeBuildVersion);

  return { version, build };
}

/** True when both version and build are available and differ (typical store builds). */
export function shouldShowBuildNumber(version: string | null, build: string | null): boolean {
  return Boolean(version && build && build !== version);
}
