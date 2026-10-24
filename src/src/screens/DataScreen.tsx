/**
 * 数据 Tab —— FlatList 列表。
 * FlatList ≈ v-for 渲染列表，区别是只渲染屏幕内的行（虚拟滚动），
 * data + renderItem + keyExtractor 三件套即可，行数多也不卡。
 */
import React from 'react';
import {FlatList, StyleSheet, Text, View} from 'react-native';

type ConnStatus = 'connected' | 'pairing' | 'disconnected';

interface Connection {
  id: string;
  name: string;
  summary: string;
  status: ConnStatus;
}

// 模拟数据：ds-connector 主题的设备连接列表
const MOCK_CONNECTIONS: Connection[] = [
  {id: 'c1', name: '开发板-A', summary: 'TCP · 192.168.1.23', status: 'connected'},
  {id: 'c2', name: '开发板-B', summary: 'TCP · 192.168.1.45', status: 'connected'},
  {id: 'c3', name: '调试探针', summary: '串口 · COM5', status: 'pairing'},
  {id: 'c4', name: '旧版网关', summary: 'TCP · 10.0.0.2', status: 'disconnected'},
  {id: 'c5', name: '传感器组', summary: 'BLE · 未配对', status: 'disconnected'},
];

const STATUS_META: Record<ConnStatus, {label: string; color: string}> = {
  connected: {label: '已连接', color: '#34c759'},
  pairing: {label: '配对中', color: '#ff9500'},
  disconnected: {label: '已断开', color: '#8e8e93'},
};

function DataScreen() {
  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={MOCK_CONNECTIONS}
      keyExtractor={item => item.id} // ≈ 绑定 :key
      renderItem={({item}) => (
        // ≈ v-for 的行模板；item 的类型由 data 自动推断
        <View style={styles.row}>
          <View style={[styles.dot, {backgroundColor: STATUS_META[item.status].color}]} />
          <View style={styles.texts}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.summary}>{item.summary}</Text>
          </View>
          <Text style={[styles.status, {color: STATUS_META[item.status].color}]}>
            {STATUS_META[item.status].label}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {flex: 1, backgroundColor: '#f5f5f7'},
  content: {padding: 16, gap: 10},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e5ea',
    padding: 14,
    gap: 12,
  },
  dot: {width: 10, height: 10, borderRadius: 5},
  texts: {flex: 1, gap: 2},
  name: {fontSize: 16, fontWeight: '600', color: '#111111'},
  summary: {fontSize: 12, color: '#8e8e93'},
  status: {fontSize: 13, fontWeight: '600'},
});

export default DataScreen;
