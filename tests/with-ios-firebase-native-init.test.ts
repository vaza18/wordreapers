import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveIosNativeAppPaths, stripRnfbSwiftAppCheckInit, patchBridgingHeader } =
  require('../plugins/with-ios-firebase-native-init.cjs') as {
    resolveIosNativeAppPaths: (
      iosRoot: string,
      projectName: string,
    ) => {
      projectName: string;
      appDir: string;
      appDelegatePath: string;
      bridgingHeaderPath: string;
      nativeInitHeaderPath: string;
      nativeInitSourcePath: string;
    };
    stripRnfbSwiftAppCheckInit: (contents: string) => string;
    patchBridgingHeader: (header: string) => string;
  };

describe('resolveIosNativeAppPaths', () => {
  it('uses Expo projectName (Wordreapers), not a hardcoded Slovozbirachi folder', () => {
    const paths = resolveIosNativeAppPaths('/tmp/ios', 'Wordreapers');
    expect(paths.appDir).toBe(path.join('/tmp/ios', 'Wordreapers'));
    expect(paths.bridgingHeaderPath).toBe(
      path.join('/tmp/ios', 'Wordreapers', 'Wordreapers-Bridging-Header.h'),
    );
    expect(paths.appDelegatePath).toBe(path.join('/tmp/ios', 'Wordreapers', 'AppDelegate.swift'));
    expect(paths.nativeInitSourcePath).toBe(
      path.join('/tmp/ios', 'Wordreapers', 'FirebaseNativeInit.m'),
    );
  });

  it('supports Cyrillic-sanitized project names when Expo emits them', () => {
    const paths = resolveIosNativeAppPaths('/tmp/ios', 'Slovozbirachi');
    expect(paths.bridgingHeaderPath).toBe(
      path.join('/tmp/ios', 'Slovozbirachi', 'Slovozbirachi-Bridging-Header.h'),
    );
  });

  it('throws when projectName is missing', () => {
    expect(() => resolveIosNativeAppPaths('/tmp/ios', '')).toThrow(/projectName/);
  });
});

describe('stripRnfbSwiftAppCheckInit', () => {
  it('removes RNFB app-check generated block without leaving Swift App Check calls', () => {
    const src = `import Expo
import FirebaseCore
import React

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
// @generated begin @react-native-firebase/app-check - expo prebuild
RNFBAppCheckModule.sharedInstance()
    FirebaseApp.configure()
// @generated end @react-native-firebase/app-check
    factory.startReactNative(
#endif
`;
    const cleaned = stripRnfbSwiftAppCheckInit(src);
    expect(cleaned).not.toContain('RNFBAppCheckModule');
    expect(cleaned).not.toContain('FirebaseApp.configure');
    expect(cleaned).not.toContain('import FirebaseCore');
    expect(cleaned).toContain('factory.startReactNative(');
  });
});

describe('patchBridgingHeader', () => {
  it('replaces RNFBAppCheckModule import with FirebaseNativeInit', () => {
    const header = `//
#import <RNFBAppCheckModule.h>
`;
    const patched = patchBridgingHeader(header);
    expect(patched).not.toContain('RNFBAppCheckModule');
    expect(patched).toContain('#import "FirebaseNativeInit.h"');
  });
});
