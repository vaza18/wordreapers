import { openBrowserAsync } from 'expo-web-browser';
import { Linking } from 'react-native';

/**
 * Open an app-constructed https URL in SFSafariViewController / Chrome Custom Tabs.
 * Falls back to Linking.openURL only if the in-app browser fails to open.
 */
export async function openAppConstructedUrl(url: string): Promise<void> {
  try {
    await openBrowserAsync(url);
  } catch {
    await Linking.openURL(url);
  }
}
