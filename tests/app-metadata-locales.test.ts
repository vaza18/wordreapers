import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ukLocalePath = path.join(process.cwd(), 'locales/app-metadata/uk.json');

describe('app metadata locales', () => {
  it('localizes the home-screen name to Словозбирачі for Ukrainian', () => {
    const locale = JSON.parse(readFileSync(ukLocalePath, 'utf8')) as {
      ios?: { CFBundleDisplayName?: string };
      android?: { app_name?: string };
    };

    expect(locale.ios?.CFBundleDisplayName).toBe('Словозбирачі');
    expect(locale.android?.app_name).toBe('Словозбирачі');
  });

  it('wires uk locale and mixed localizations in app.json', () => {
    const appJson = JSON.parse(readFileSync(path.join(process.cwd(), 'app.json'), 'utf8')) as {
      expo: {
        locales?: Record<string, string>;
        ios?: { infoPlist?: { CFBundleAllowMixedLocalizations?: boolean } };
      };
    };

    expect(appJson.expo.locales?.uk).toBe('./locales/app-metadata/uk.json');
    expect(appJson.expo.ios?.infoPlist?.CFBundleAllowMixedLocalizations).toBe(true);
  });
});
