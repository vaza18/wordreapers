const fs = require('node:fs');
const path = require('node:path');

const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const APP_CHECK_TAG = '@react-native-firebase/app-check-native-init';
const APP_CHECK_BLOCK = 'WRConfigureFirebaseNative()';

const FIREBASE_NATIVE_INIT_M = `#import "FirebaseNativeInit.h"

#import <FirebaseCore/FirebaseCore.h>
#import "RNFBAppCheckModule.h"

void WRConfigureFirebaseNative(void) {
  [RNFBAppCheckModule sharedInstance];
  [FIRApp configure];
}
`;

const FIREBASE_NATIVE_INIT_H = `#import <Foundation/Foundation.h>

FOUNDATION_EXPORT void WRConfigureFirebaseNative(void);
`;

/**
 * Native Firebase + App Check bootstrap without Swift bridging-header module maps.
 */
module.exports = function withIosFirebaseNativeInit(config) {
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosRoot = config.modRequest.platformProjectRoot;
      const appDir = path.join(iosRoot, 'Slovozbirachi');
      fs.mkdirSync(appDir, { recursive: true });
      fs.writeFileSync(path.join(appDir, 'FirebaseNativeInit.h'), FIREBASE_NATIVE_INIT_H);
      fs.writeFileSync(path.join(appDir, 'FirebaseNativeInit.m'), FIREBASE_NATIVE_INIT_M);

      const appDelegatePath = path.join(appDir, 'AppDelegate.swift');
      if (fs.existsSync(appDelegatePath)) {
        let contents = fs.readFileSync(appDelegatePath, 'utf8');
        let cleaned = contents
          .replace(/\nimport FirebaseCore\n/g, '\n')
          .replace(/^[^\n]*-native-init[^\n]*\n/gm, '')
          .replace(
            /\/\/ @generated begin @react-native-firebase\/app-check[\s\S]*?\/\/ @generated end @react-native-firebase\/app-check\n?/g,
            '',
          )
          .replace(
            /RNFBAppCheckModule\.sharedInstance\(\)\s*\n\s*FirebaseApp\.configure\(\)\s*\n?/g,
            '',
          );

        const merged = mergeContents({
          tag: APP_CHECK_TAG,
          src: cleaned,
          newSrc: `    ${APP_CHECK_BLOCK}`,
          anchor: /window = UIWindow\(frame: UIScreen\.main\.bounds\)/,
          offset: 0,
          comment: '//',
        });
        fs.writeFileSync(appDelegatePath, merged.contents);
      }

      const bridgingHeaderPath = path.join(appDir, 'Slovozbirachi-Bridging-Header.h');
      if (fs.existsSync(bridgingHeaderPath)) {
        let header = fs.readFileSync(bridgingHeaderPath, 'utf8');
        header = header.replace(/#import [<"]RNFBAppCheckModule\.h[>"]\n?/g, '');
        if (!header.includes('FirebaseNativeInit.h')) {
          header += '\n#import "FirebaseNativeInit.h"\n';
        }
        fs.writeFileSync(bridgingHeaderPath, header);
      }

      return config;
    },
  ]);

  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const groupKey = project.findPBXGroupKey({ name: 'Slovozbirachi' });
    if (!groupKey) {
      return config;
    }

    for (const fileName of ['FirebaseNativeInit.h', 'FirebaseNativeInit.m']) {
      if (project.hasFile(`Slovozbirachi/${fileName}`)) {
        continue;
      }
      if (fileName.endsWith('.m')) {
        project.addSourceFile(
          `Slovozbirachi/${fileName}`,
          { target: project.getFirstTarget().uuid },
          groupKey,
        );
      } else {
        project.addFile(`Slovozbirachi/${fileName}`, groupKey);
      }
    }

    return config;
  });

  return config;
};
