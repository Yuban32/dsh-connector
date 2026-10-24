/**
 * 应用根组件（替代之前的临时占位页，原模板仍在 App.tsx.bak-template）。
 * 三层包裹各自的作用，对照 vue-router：
 *   SafeAreaProvider     ≈ 全局安全区上下文（避开状态栏/手势条；原生模块走已挂的移植版 har）
 *   NavigationContainer  ≈ app.use(router)——整个应用只包一次
 *   RootTabNavigator     ≈ 路由表 + <router-view>
 */
import React from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationContainer} from '@react-navigation/native';
import RootTabNavigator from './src/navigation/RootTabNavigator';

function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar barStyle="dark-content" />
        <RootTabNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default App;
