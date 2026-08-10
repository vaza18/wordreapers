const { withProjectBuildGradle } = require('expo/config-plugins');

/**
 * Patches the top-level android/build.gradle to force a specific AGP version.
 * This resolves CXX5304 "SDK XML versions up to 3 but an SDK XML file of version 4 was encountered"
 * errors when using newer Android SDKs (e.g. 2026 releases) with Java 25.
 */
module.exports = function withAgpVersionPatch(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      config.modResults.contents = patchBuildGradle(config.modResults.contents);
    }
    return config;
  });
};

function patchBuildGradle(contents) {
  // Replace the default AGP classpath with a fixed version
  const agpVersion = '8.7.3';
  const pattern = /classpath\(['"]com\.android\.tools\.build:gradle['"]\)/g;
  const replacement = `classpath('com.android.tools.build:gradle:${agpVersion}')`;

  if (contents.match(pattern)) {
    return contents.replace(pattern, replacement);
  }

  // Fallback for classpath 'com.android.tools.build:gradle:X.Y.Z'
  const versionPattern = /classpath\(['"]com\.android\.tools\.build:gradle:[\d\.]+['"]\)/g;
  if (contents.match(versionPattern)) {
    return contents.replace(versionPattern, replacement);
  }

  return contents;
}
