const { mergeConfig, getDefaultConfig } = require('@react-native/metro-config');
const { createHarmonyMetroConfig } = require('@react-native-oh/react-native-harmony/metro.config');

/**
 * Metro configuration — RNOH template + local blockList.
 * createHarmonyMetroConfig adds the 'harmony' platform resolution rules
 * required by @react-native-oh/react-native-harmony (e.g. rndevtools modules).
 * blockList keeps Metro's file watcher away from HarmonyOS build artifacts
 * (CMake .cxx try-compile dirs crash the fallback watcher when deleted).
 */

const config = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  resolver: {
    blockList: [
      /harmony[\/](entry[\/]\.cxx|entry[\/]build|oh_modules|build|\.hvigor)[\/]/,
    ],
  },
};

module.exports = mergeConfig(
  getDefaultConfig(__dirname),
  createHarmonyMetroConfig({
    reactNativeHarmonyPackageName: '@react-native-oh/react-native-harmony',
  }),
  config,
);
