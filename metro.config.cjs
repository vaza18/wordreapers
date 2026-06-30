const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('txt', 'gz');

/** npm may nest react-native@0.86 as a peer-dep artifact under react-native@0.81; never bundle it. */
const nestedReactNative = /node_modules[/\\]react-native[/\\]node_modules[/\\]react-native[/\\].*/;
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  nestedReactNative,
];

/** Nested under `firebase`; Metro needs an explicit alias for RN auth persistence. */
const firebaseAuthRoot = path.resolve(
  __dirname,
  'node_modules/firebase/node_modules/@firebase/auth',
);
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
