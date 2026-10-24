/**
 * 首页 Tab —— 布局（View/Text 盒模型）+ 代码式导航演示。
 * navigation.navigate('Data') ≈ router.push({ name: 'Data' })，对 Tab 就是直接切过去。
 */
import React from 'react';
import {Button, StyleSheet, Text, View} from 'react-native';
import type {BottomTabScreenProps} from '@react-navigation/bottom-tabs';
import type {RootTabParamList} from '../navigation/RootTabNavigator';

// 泛型标明本页在路由表中的名字后，navigate('...') 的路由名就有类型检查了（§1.4 末尾约定的完整写法）
type Props = BottomTabScreenProps<RootTabParamList, 'Home'>;

function HomeScreen({navigation}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>DS Connector</Text>
        <Text style={styles.subtitle}>React Native × HarmonyOS</Text>
        <Text style={styles.body}>
          底部 Tab 导航 quick start。三个 Tab 各演示一点基础：本页是布局与代码导航，
          「数据」演示 FlatList 列表，「设置」演示开关表单。
        </Text>
      </View>
      {/* onPress ≈ @click；navigate 到已在路由表里的 Tab = 切换过去 */}
      <Button
        title="查看「数据」Tab"
        color="#0a84ff"
        onPress={() => navigation.navigate('Data')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7', padding: 16, gap: 16},
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e5ea',
    padding: 20,
    gap: 8,
  },
  title: {fontSize: 24, fontWeight: '700', color: '#111111'},
  subtitle: {fontSize: 13, color: '#8e8e93'},
  body: {fontSize: 15, lineHeight: 22, color: '#3a3a3c', marginTop: 4},
});

export default HomeScreen;
