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
 * Resolve native iOS app paths from Expo's projectName (not a hardcoded folder).
 * Production builds use `Wordreapers`; Cyrillic display name may sanitize differently.
 */
function resolveIosNativeAppPaths(iosRoot, projectName) {
  if (!projectName || typeof projectName !== 'string') {
    throw new Error('with-ios-firebase-native-init: missing modRequest.projectName');
  }
  const appDir = path.join(iosRoot, projectName);
  return {
    projectName,
    appDir,
    appDelegatePath: path.join(appDir, 'AppDelegate.swift'),
    bridgingHeaderPath: path.join(appDir, `${projectName}-Bridging-Header.h`),
    nativeInitHeaderPath: path.join(appDir, 'FirebaseNativeInit.h'),
    nativeInitSourcePath: path.join(appDir, 'FirebaseNativeInit.m'),
  };
}

/** Strip RNFB Swift App Check / FirebaseApp.configure blocks (not our native-init tag). */
function stripRnfbSwiftAppCheckInit(contents) {
  return contents
    .replace(/\nimport FirebaseCore\n/g, '\n')
    .replace(
      /\/\/ @generated begin @react-native-firebase\/app-check-native-init[\s\S]*?\/\/ @generated end @react-native-firebase\/app-check-native-init[^\n]*\n?/g,
      '',
    )
    .replace(
      /\/\/ @generated begin @react-native-firebase\/app-check(?!-native-init)[\s\S]*?\/\/ @generated end @react-native-firebase\/app-check(?!-native-init)[^\n]*\n?/g,
      '',
    )
    .replace(
      /\/\/ @generated begin @react-native-firebase\/app-didFinishLaunchingWithOptions[\s\S]*?\/\/ @generated end @react-native-firebase\/app-didFinishLaunchingWithOptions[^\n]*\n?/g,
      '',
    )
    .replace(/RNFBAppCheckModule\.sharedInstance\(\)\s*\n\s*FirebaseApp\.configure\(\)\s*\n?/g, '')
    .replace(/^\s*FirebaseApp\.configure\(\)\s*\n/gm, '')
    .replace(/^\s*WRConfigureFirebaseNative\(\)\s*\n/gm, '');
}

function patchBridgingHeader(header) {
  let next = header.replace(/#import [<"]RNFBAppCheckModule\.h[>"]\n?/g, '');
  if (!next.includes('FirebaseNativeInit.h')) {
    next += '\n#import "FirebaseNativeInit.h"\n';
  }
  return next;
}

/**
 * Native Firebase + App Check bootstrap without Swift bridging-header module maps.
 */
function withIosFirebaseNativeInit(config) {
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosRoot = config.modRequest.platformProjectRoot;
      const paths = resolveIosNativeAppPaths(iosRoot, config.modRequest.projectName);
      fs.mkdirSync(paths.appDir, { recursive: true });
      fs.writeFileSync(paths.nativeInitHeaderPath, FIREBASE_NATIVE_INIT_H);
      fs.writeFileSync(paths.nativeInitSourcePath, FIREBASE_NATIVE_INIT_M);

      if (fs.existsSync(paths.appDelegatePath)) {
        const contents = fs.readFileSync(paths.appDelegatePath, 'utf8');
        const cleaned = stripRnfbSwiftAppCheckInit(contents);
        const merged = mergeContents({
          tag: APP_CHECK_TAG,
          src: cleaned,
          newSrc: `    ${APP_CHECK_BLOCK}`,
          anchor: /factory\.startReactNative\(/,
          offset: 0,
          comment: '//',
        });
        fs.writeFileSync(paths.appDelegatePath, merged.contents);
      }

      if (fs.existsSync(paths.bridgingHeaderPath)) {
        const header = fs.readFileSync(paths.bridgingHeaderPath, 'utf8');
        fs.writeFileSync(paths.bridgingHeaderPath, patchBridgingHeader(header));
      }

      return config;
    },
  ]);

  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = config.modRequest.projectName;
    if (!projectName) {
      return config;
    }
    const groupKey = project.findPBXGroupKey({ name: projectName });
    if (!groupKey) {
      return config;
    }

    for (const fileName of ['FirebaseNativeInit.h', 'FirebaseNativeInit.m']) {
      const relativePath = `${projectName}/${fileName}`;
      if (project.hasFile(relativePath)) {
        continue;
      }
      if (fileName.endsWith('.m')) {
        project.addSourceFile(relativePath, { target: project.getFirstTarget().uuid }, groupKey);
      } else {
        project.addFile(relativePath, groupKey);
      }
    }

    return config;
  });

  return config;
}

module.exports = withIosFirebaseNativeInit;
module.exports.resolveIosNativeAppPaths = resolveIosNativeAppPaths;
module.exports.stripRnfbSwiftAppCheckInit = stripRnfbSwiftAppCheckInit;
module.exports.patchBridgingHeader = patchBridgingHeader;
