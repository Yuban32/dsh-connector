/**
 * 根 Tab 导航器。
 * 与 vue-router 的对应关系（详见教程 §1.4）：
 *   NavigationContainer（在 App.tsx）≈ app.use(router)，整个应用只包一次
 *   Tab.Navigator                    ≈ 路由表 + <router-view> 的合体
 *   Tab.Screen                       ≈ routes 里的一条 { path, component }
 * Tab 切换时页面不卸载（≈ <keep-alive> 包住的动态组件），各页 useState 状态切走再回来还在。
 */
import React from 'react';
import {Text} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/HomeScreen';
import DataScreen from '../screens/DataScreen';
import SettingsScreen from '../screens/SettingsScreen';

/** 路由表类型：Tab 名 → 该页能接收的参数形状。本例三个 Tab 都不传参（undefined）。 */
export type RootTabParamList = {
  Home: undefined;
  Data: undefined;
  Settings: undefined;
};

// ≈ createRouter()：拿到 Navigator（渲染当前页）和 Screen（声明路由）这对组件
const Tab = createBottomTabNavigator<RootTabParamList>();

// tabBarIcon 返回的元素画在底栏图标位。quick start 用 emoji 顶替（免装图标库移植版）；
// emoji 自带颜色、不受选中色影响，生产项目可换 @react-native-ohos 移植的图标库。
function renderIcon(glyph: string) {
  return ({size}: {size: number; color: string}) => (
    <Text style={{fontSize: size, lineHeight: size + 2}}>{glyph}</Text>
  );
}

function RootTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: true, // 顶部标题栏（JS 实现，与 Tab 栏共用下面的选中色配置）
        tabBarActiveTintColor: '#0a84ff',
        tabBarInactiveTintColor: '#8e8e93',
        tabBarLabelStyle: {fontSize: 12},
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{title: '首页', tabBarIcon: renderIcon('🏠')}}
      />
      <Tab.Screen
        name="Data"
        component={DataScreen}
        options={{title: '数据', tabBarIcon: renderIcon('📊')}}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{title: '设置', tabBarIcon: renderIcon('⚙️')}}
      />
    </Tab.Navigator>
  );
}

export default RootTabNavigator;
