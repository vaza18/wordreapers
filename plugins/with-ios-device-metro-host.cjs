const fs = require('node:fs');
const path = require('node:path');

const { withDangerousMod, withInfoPlist } = require('expo/config-plugins');

const DEFAULT_BUNDLE_URL = `  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }`;

const DEVICE_BUNDLE_URL = `  override func bundleURL() -> URL? {
#if DEBUG
    #if !targetEnvironment(simulator)
    let embedded = Bundle.main.url(forResource: "main", withExtension: "jsbundle")
    if let host = Bundle.main.object(forInfoDictionaryKey: "EXMetroHost") as? String, !host.isEmpty,
       RCTBundleURLProvider.isPackagerRunning("\\(host):8081") {
      let settings = RCTBundleURLProvider.sharedSettings()
      settings.jsLocation = host
      return settings.jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry") ?? embedded
    }
    return embedded
    #else
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
      ?? Bundle.main.url(forResource: "main", withExtension: "jsbundle")
    #endif
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }`;

const PBX_SKIP_BUNDLING_OLD =
  'if [[ \\"$CONFIGURATION\\" = *Debug* ]]; then\\n  export SKIP_BUNDLING=1\\nfi';
const PBX_SKIP_BUNDLING_OLD_SIMULATOR_EFFECTIVE =
  'if [[ \\"$CONFIGURATION\\" = *Debug* ]] && [[ \\"$EFFECTIVE_PLATFORM_NAME\\" == *simulator* ]]; then\\n  export SKIP_BUNDLING=1\\nfi';
const PBX_SKIP_BUNDLING_NEW =
  'if [[ \\"$CONFIGURATION\\" = *Debug* ]] && [[ \\"$PLATFORM_NAME\\" == *simulator* ]]; then\\n  export SKIP_BUNDLING=1\\nfi';

function patchPbxprojSkipBundling(contents) {
  if (contents.includes(PBX_SKIP_BUNDLING_NEW)) {
    return contents;
  }
  if (contents.includes(PBX_SKIP_BUNDLING_OLD_SIMULATOR_EFFECTIVE)) {
    return contents.replace(PBX_SKIP_BUNDLING_OLD_SIMULATOR_EFFECTIVE, PBX_SKIP_BUNDLING_NEW);
  }

  if (contents.includes(PBX_SKIP_BUNDLING_OLD)) {
    return contents.replace(PBX_SKIP_BUNDLING_OLD, PBX_SKIP_BUNDLING_NEW);
  }
  return contents;
}

function detectLanIp() {
  const { execSync } = require('node:child_process');
  for (const iface of ['en0', 'en1', 'bridge0']) {
    try {
      const ip = execSync(`ipconfig getifaddr ${iface}`, { encoding: 'utf8' }).trim();
      if (ip) {
        return ip;
      }
    } catch {
      // try next interface
    }
  }
  return null;
}

function patchAppDelegate(contents) {
  if (contents.includes('isPackagerRunning')) {
    return contents;
  }
  if (contents.includes(DEFAULT_BUNDLE_URL)) {
    return contents.replace(DEFAULT_BUNDLE_URL, DEVICE_BUNDLE_URL);
  }
  return contents;
}

/** Physical iPhone needs Mac LAN IP for Metro; simulator keeps localhost. */
module.exports = function withIosDeviceMetroHost(config) {
  const metroHost =
    process.env.REACT_NATIVE_PACKAGER_HOSTNAME?.trim() || detectLanIp() || undefined;

  config = withInfoPlist(config, (config) => {
    if (metroHost) {
      config.modResults.EXMetroHost = metroHost;
    }
    return config;
  });

  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectName = config.modRequest.projectName ?? 'Wordreapers';
      const appDelegatePath = path.join(
        config.modRequest.platformProjectRoot,
        projectName,
        'AppDelegate.swift',
      );
      const pbxprojPath = path.join(
        config.modRequest.platformProjectRoot,
        `${projectName}.xcodeproj`,
        'project.pbxproj',
      );

      if (fs.existsSync(appDelegatePath)) {
        const contents = fs.readFileSync(appDelegatePath, 'utf8');
        const next = patchAppDelegate(contents);
        if (next !== contents) {
          fs.writeFileSync(appDelegatePath, next);
        }
      }

      if (fs.existsSync(pbxprojPath)) {
        const contents = fs.readFileSync(pbxprojPath, 'utf8');
        const next = patchPbxprojSkipBundling(contents);
        if (next !== contents) {
          fs.writeFileSync(pbxprojPath, next);
        }
      }
      return config;
    },
  ]);
};

module.exports.patchAppDelegate = patchAppDelegate;
module.exports.patchPbxprojSkipBundling = patchPbxprojSkipBundling;
module.exports.DEVICE_BUNDLE_URL = DEVICE_BUNDLE_URL;
module.exports.DEFAULT_BUNDLE_URL = DEFAULT_BUNDLE_URL;
