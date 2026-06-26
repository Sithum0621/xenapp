const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const nativeOnlyPackages = [
  '@react-native-firebase/app',
  '@react-native-firebase/messaging',
  '@notifee/react-native',
];

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && nativeOnlyPackages.some((pkg) => moduleName === pkg || moduleName.startsWith(`${pkg}/`))) {
    return { type: 'empty' };
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
