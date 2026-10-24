module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // react-native-reanimated 4 的编译插件（把 worklet 函数编译成可跨线程执行的形态）。
  // 官方要求必须放在 plugins 的最后一位（§6.12：接 react-navigation 后随之引入的依赖）。
  plugins: ['react-native-worklets/plugin'],
};
