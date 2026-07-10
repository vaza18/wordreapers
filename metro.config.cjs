const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Expo 55 / Node 22 binds Metro to IPv6 (::1); dev URLs must use localhost, not 127.0.0.1.

config.resolver.assetExts.push('txt');
/** npm may nest react-native as a peer-dep artifact; never bundle the phantom copy. */
const nestedReactNative = /node_modules[/\\]react-native[/\\]node_modules[/\\]react-native[/\\].*/;
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  nestedReactNative,
];

/** Firebase 12 hoists @firebase/auth; older layouts nested it under firebase/. */
function resolveFirebaseAuthRoot() {
  const nested = path.resolve(__dirname, 'node_modules/firebase/node_modules/@firebase/auth');
  if (fs.existsSync(path.join(nested, 'dist/rn/index.js'))) {
    return nested;
  }
  return path.resolve(__dirname, 'node_modules/@firebase/auth');
}

const firebaseAuthRoot = resolveFirebaseAuthRoot();
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@firebase/auth': firebaseAuthRoot,
};

/** Map Node-style `.js` TypeScript imports to `.ts` sources for Metro. */
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleImport, platform) => {
  if (moduleImport === '@firebase/auth/dist/rn/index.js') {
    return {
      type: 'sourceFile',
      filePath: path.join(firebaseAuthRoot, 'dist/rn/index.js'),
    };
  }
  if (moduleImport.startsWith('.') && moduleImport.endsWith('.js')) {
    const redirected = moduleImport.replace(/\.js$/, '');
    if (defaultResolveRequest) {
      return defaultResolveRequest(context, redirected, platform);
    }
    return context.resolveRequest(context, redirected, platform);
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleImport, platform);
  }
  return context.resolveRequest(context, moduleImport, platform);
};

module.exports = config;
