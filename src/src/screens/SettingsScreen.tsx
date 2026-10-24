/**
 * 设置 Tab —— 受控组件演示。
 * RN 没有 v-model，约定是「value + 回调」成对出现（Switch 用 value/onValueChange，
 * TextInput 用 value/onChangeText）。≈ Vue 里手写
 * <Switch :value="x" @update:value="x = $event" />，即 v-model 的展开形式。
 * useState ≈ ref()：读值直接用变量，写值调 set 函数，写完组件自动重渲染。
 */
import React, {useState} from 'react';
import {StyleSheet, Switch, Text, View} from 'react-native';

function SettingsScreen() {
  const [autoReconnect, setAutoReconnect] = useState(true); // ≈ const x = ref(true)
  const [onlineOnly, setOnlineOnly] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>断线自动重连</Text>
          <Switch value={autoReconnect} onValueChange={setAutoReconnect} />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>列表只显示在线设备</Text>
          <Switch value={onlineOnly} onValueChange={setOnlineOnly} />
        </View>
      </View>
      <Text style={styles.hint}>
        提示：切到别的 Tab 再回来，开关状态还在——Tab 切换只是隐藏页面不卸载（≈ keep-alive）。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f7', padding: 16, gap: 12},
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e5ea',
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  label: {fontSize: 16, color: '#111111'},
  hint: {fontSize: 13, lineHeight: 19, color: '#8e8e93', paddingHorizontal: 4},
});

export default SettingsScreen;
