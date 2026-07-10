const fs = require('node:fs');
const path = require('node:path');

const { withDangerousMod } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const MARKER = '$RNFirebaseAsStaticFramework = true';
const SDK_VERSION = '12.15.0';
const SDK_MARKER = `$FirebaseSDKVersion = '${SDK_VERSION}'`;
const HEADERS_MARKER = 'use_modular_headers!';
const POST_INSTALL_TAG = 'wordreapers-ios-post-install';
const POST_INSTALL_PATCH = `    # Align pod deployment targets (PromisesObjC privacy pods ship iOS 9.0).
    deployment_target = podfile_properties['ios.deploymentTarget'] || '15.1'
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |bc|
        bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = deployment_target
        # RNFBApp imports React-Core headers inside a static framework module.
        bc.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
        if target.name == 'RNFBAppCheck'
          bc.build_settings['CLANG_ENABLE_MODULES'] = 'NO'
        end
      end
    end

    # RNFB Core Configuration has input-only paths; disable dependency analysis warning.
    installer.aggregate_targets.each do |aggregate_target|
      aggregate_target.user_project.native_targets.each do |target|
        target.shell_script_build_phases.each do |phase|
          if phase.name == '[CP-User] [RNFB] Core Configuration'
            phase.always_out_of_date = '1'
          end
        end
      end
      aggregate_target.user_project.save
    end
`;

const PODFILE_PREAMBLE = `# React Native Firebase + expo-build-properties (useFrameworks: static)
$RNFirebaseAsStaticFramework = true
# 12.15 aligns with @react-native-firebase/app@25.1; pin if CocoaPods static build regresses.
$FirebaseSDKVersion = '${SDK_VERSION}'

prepare_react_native_project!

use_modular_headers!
`;

/**
 * Static Firebase on iOS: modular headers + RNFB static_framework + SDK pin for CocoaPods build.
 */
module.exports = function withIosModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (!contents.includes(MARKER)) {
        contents = contents.replace('prepare_react_native_project!\n', PODFILE_PREAMBLE);
      } else if (!contents.includes(SDK_MARKER)) {
        contents = contents.replace(MARKER, `${MARKER}\n$FirebaseSDKVersion = '${SDK_VERSION}'`);
      }

      if (!contents.includes(HEADERS_MARKER)) {
        contents = contents.replace(
          'prepare_react_native_project!\n',
          'prepare_react_native_project!\n\nuse_modular_headers!\n',
        );
      }

      if (contents.includes('post_install do |installer|')) {
        const anchorLine = ':ccache_enabled => ccache_enabled?(podfile_properties),';
        const escapedAnchor = anchorLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const merged = mergeContents({
          tag: POST_INSTALL_TAG,
          src: contents,
          newSrc: POST_INSTALL_PATCH,
          anchor: new RegExp(escapedAnchor),
          offset: 2,
          comment: '#',
        });
        contents = merged.contents;
      }

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
};
