# React Native on HarmonyOS 入门教程

> 基于 DSH Connector（原名 MyRNProject084；React Native 0.84 + RNOH `@react-native-oh/react-native-harmony`）在 Windows 上的真实踩坑全过程整理。
> 适用于：首次接触 RN-on-HarmonyOS 开发、需要在 Windows + DevEco 模拟器上跑通调试环境的开发者；**没写过 React / RN 的**请先读 §1.2–§1.4。
> 配套文档：[开发环境启动教程.md](开发环境启动教程.md) · [项目目录架构设计.md](项目目录架构设计.md) · [移动开发规范.md](移动开发规范.md)

---

## 0. 当前项目状态（2026-11-10）

- ✅ 模拟器（DevEco x86_64）上应用已成功运行并渲染
- ✅ Metro 热更新链路已打通
- ✅ **底部 Tab quick start 已就位**：`App.tsx` = SafeAreaProvider + NavigationContainer + 三个 Tab（首页/数据/设置），
  代码在 `src/navigation/RootTabNavigator.tsx` + `src/screens/*.tsx`（React Navigation v7，见 §1.4 与 §6.14）
- ✅ 三方库移植版已装齐并挂 har（safe-area-context / screens / gesture-handler / netinfo / reanimated + worklets，
  见 §6.9、§6.14）；§7 描述的"还原原版模板"已不再执行——`App.tsx` 直接演进为 Tab 应用，模板仍备份在 `App.tsx.bak-template`
- 包名：`com.yuban32.dshconnector`

---

## 1. 环境总览

| 组件 | 说明 |
|---|---|
| DevEco Studio | `J:\Development\Program Files\DevEco Studio`（**26.0.0**，2026-11-12 升级） |
| SDK | 真实目录 `J:\Development\sdk-ohos\26.0.0`（DevEco 26 起 SDK 独立于安装目录）；旧 `...\DevEco Studio\sdk\default\openharmony\` 下 5 个组件目录已重建为 **junction** 指向真实组件（兼容 RNOH CLI 的旧布局假设，2026-11-16） |
| 环境变量 | `DEVECO_SDK_HOME` **指向 `J:\Development\Program Files\DevEco Studio\sdk`**（旧布局根——RNOH CLI 0.84.3 硬编码 `<根>\<首目录>\openharmony\toolchains\hdc` 且要求 `<根>\..\tools` 存在，勿改指 `sdk-ohos`）；hdc / ohpm 已在 Windows 用户 PATH（2026-11-16 配置） |
| Node/pnpm | node + pnpm 在 PATH 上，JS 依赖用 pnpm 管理 |
| Windows 长路径 | 注册表 `LongPathsEnabled = 1`（本机已开启，含重启生效） |
| 模拟器 | DevEco 模拟器为 **x86_64** 架构（`hdc list targets` 显示 `127.0.0.1:5555`） |
| hdc | `J:\Development\sdk-ohos\26.0.0\toolchains\hdc.exe`（鸿蒙的 adb；已入 PATH，直接 `hdc` 即可） |
| ohpm | `J:\Development\Program Files\DevEco Studio\tools\ohpm\bin`（已入 PATH） |

**架构关键点**：模拟器是 x86_64，真机是 arm64-v8a。两边都要跑就必须双 ABI 都编译（本项目已配置）。

---

### 1.1 写给 Vue 开发者：React / RN / 移动端概念对照

如果你来自 Vue 生态，先用这张表建立映射，再往下看会顺畅很多。
**零基础（没写过 React / RN）**：请先按 §1.2 → §1.3 → §1.4 顺序补课，读完后把本节当速查索引用：

| 你熟悉的（Vue） | RN 对应 | 差异要点 |
|---|---|---|
| Vue 3 + SFC（template/script/style 三段式） | React 函数组件 + JSX | React **没有模板**，UI 直接用 JS 表达式写；一个文件就是一个组件 |
| `main.ts` 里 `createApp(App).mount('#app')` | `index.js` 里 `AppRegistry.registerComponent` | 挂载目标不是 DOM，而是**原生 App 容器**（本项目里是鸿蒙壳） |
| `App.vue` | `App.tsx` | 同为根组件 |
| Vite / `vite.config.ts` | Metro / `metro.config.js` | 职责几乎一样：dev server、模块解析、转译、HMR |
| `<style scoped>` | `StyleSheet.create`（JS 对象） | 没有级联/继承/伪类；flexbox 默认主轴是 **column**（Web 默认 row） |
| Element Plus 这类组件库 | 内置组件 `View`/`Text`/`Image`/`ScrollView` | 映射到**原生控件**，不是 div/span；也没有完整 CSS |
| vue-router | `@react-navigation`（三方库） | RN 没有官方内置路由（速成见 §1.4） |
| Pinia / Vuex | Redux / Zustand / MobX | 生态分裂，无官方钦定 |
| `ref()` / `watch()` | `useState()` / `useEffect()` | **心智模型最大的坑**：hooks 靠依赖数组触发，时序语义和 watch 不同（§1.2 详述） |
| `v-if` / `v-for` / `:props` / `@emit` | JSX 三元 / `.map()` / props / 回调 props | |
| unplugin 等构建期代码生成 | RN Codegen | JS 组件规格 → 自动生成原生绑定代码（`entry/src/main/cpp/generated/` 等，**别手改**） |

**用 Vue 视角重读本项目的文件**：

```
index.js          ≈ main.ts（入口注册）
App.tsx           ≈ App.vue（但一个 .tsx 文件 = 组件全部，无三段式）
metro.config.js   ≈ vite.config.ts
babel.config.js   ≈ 转译层配置（Vite 里你感知不到，RN 这层是显式的）
app.json          ≈ 应用元信息（名字）
android/  ios/    ≈ 模板默认送的其它平台壳工程（本项目不用）
harmony/          ≈ 鸿蒙的"壳工程"——相当于 uni-app 里某平台的目录，
                    但它是能独立用 DevEco 打开构建的标准鸿蒙工程
harmony/entry/src/main/ets ≈ 壳工程的"原生页面代码"（ArkTS）
harmony/entry/src/main/cpp ≈ 更深的原生桥接层（C++），RNOH 框架本体住在 .har 包里
```

**双包管理器**是前端生涯少见的：`pnpm`（node_modules，管 JS）+ `ohpm`（oh_modules，管 ArkTS/原生）各管一界，`.har` 包是两个世界的桥。类比 monorepo 里 npm + cargo 并存。

**移动开发规范速成（Web 背景最容易懵的点）**：

1. **没有浏览器、没有 DOM**：`div`→`View`，`img`→`Image`；**任何文字必须包在 `<Text>` 里**，裸文字直接报错——RN 新手第一个编译错误
2. **样式是 JS 对象、CSS 的子集**：无选择器、无级联；布局天然 flexbox；数字单位是密度无关像素（dp）
3. **平台分身文件**：组件可有 `.android.js` / `.ios.js` / `.harmony.js` 变体，Metro 按目标平台选（§6.5 的解析错误就是 harmony 变体缺失）
4. **带原生代码的三方库需要各平台适配层**：鸿蒙对应 `@react-native-oh-tpl/<库名>` 移植包（§7 白屏问题的根源）。类比"组件库要出 vue3 适配版本"
5. **应用生命周期**：前台/后台（`RNAbility background/foreground`）≠ 组件生命周期（mount/unmount）
6. **debug vs release**：debug 包 JS 运行时从 Metro 拉（所以有"端口转发"）；release 包 JS 打进安装包，不需要 Metro——类比 dev server vs 构建产物
7. **包名 / 签名 / ABI**：`com.yuban32.dshconnector` 是应用唯一 ID；签名用于真机分发；ABI（arm64/x86_64）对应 CPU 架构（§6.3 的坑：发布产物不含模拟器 CPU 架构）

**React 组件 5 分钟速成**（对照 Vue 写法）：

```tsx
// Vue: <script setup> 里 ref/watch，template 里渲染
// React: 一个函数搞定，props 是参数，状态用 useState
import { useState, useEffect } from 'react';
import { Text, View } from 'react-native';

function Counter({ start }: { start: number }) {
  const [count, setCount] = useState(start);   // ≈ const count = ref(start)
  useEffect(() => {
    console.log('count 变了:', count);
  }, [count]);                                 // ≈ watch(count, ...)，但初值也会触发一次
  return (
    <View>
      <Text onPress={() => setCount(count + 1)}>{count}</Text>
      {/* ≈ <Text @click="count++">{{ count }}</Text> */}
    </View>
  );
}
```

三条铁律：**组件就是函数**；**props 只读**（改它要靠回调往上传）；**JSX 的 `{}` 里写任意 JS 表达式**（相当于 template 插值 + 指令的合体）。

### 1.2 React 速成（零基础，Vue 视角）

上一节是"是什么"，这一节补"怎么写"。现代 React 只用**函数组件 + hooks**（类组件已过时，本项目全程不涉及）。

**① 组件就是函数，JSX 就是返回值**——没有 template/script/style 三段式：

```tsx
function Greet({ name }: { name: string }) {
  return <Text>你好，{name}</Text>;
}
// ≈ Vue SFC：<script setup> 里 defineProps<{ name: string }>()，
//   template 里 <text>你好，{{ name }}</text>——React 把两段合成一个函数
```

JSX 对照 template 的写法：

| template 里 | JSX 里 |
|---|---|
| `{{ x }}` 插值 | `{x}` |
| `v-if` / `v-show` | 三元 `cond ? <A /> : null`，或 `cond && <A />` |
| `v-for` | `list.map(item => <Text key={item.id}>…</Text>)` |
| `@click="fn"` / `:prop="v"` | `onPress={fn}` / `prop={v}`（都是普通属性，没有 `@` `:` 简写） |
| 注释 `<!-- -->` | `{/* 注释 */}` |
| 语句（`if` / `for`） | **不允许**——`{}` 里只能写表达式；逻辑复杂就 early return 或提成变量 |

**② props 只读，子→父靠回调 props**（≈ `defineEmits`，但没有 `emit` 仪式，回调就是普通 prop）：

```tsx
function SearchBox({ onSearch }: { onSearch: (kw: string) => void }) {
  return <Button title="搜索" onPress={() => onSearch('RN')} />;
}
// 父组件里：<SearchBox onSearch={doSearch} /> ≈ <SearchBox @search="doSearch" />
```

`props.children` ≈ 默认 slot。

**③ 状态：`useState` ≈ `ref`，但心智模型不同**——这是 Vue 开发者最大的坎：

```tsx
const [count, setCount] = useState(0);   // ≈ const count = ref(0)，但没有 .value
setCount(count + 1);                     // ≈ count.value++（必须走 setter，直接改无效）
setUser({ ...user, age: 18 });           // 改对象=整体替换！user.age = 18 不会触发更新
```

- Vue 是**深度响应式**：proxy 改一个属性，精准更新依赖它的视图
- React 是**不可变替换**：换掉整个值，**组件函数整个重跑一遍**（重新执行 return 生成新 JSX，框架内部 diff 出差异去更新原生控件）——所以没有"精准改一处"的概念，setState 就是"我要用新值重渲染"

**④ 副作用：`useEffect` = `watch` + `onMounted` + `onUnmounted` 三合一**：

```tsx
useEffect(() => {
  const sub = scanner.addListener(cb);   // 挂监听 ≈ onMounted 里做初始化
  return () => sub.remove();             // 返回的函数在卸载/重跑前执行 ≈ onUnmounted
}, [enabled]);                           // 依赖数组 ≈ watch 的侦听源

useEffect(() => { loadDevices(); }, []); // 空数组 = 仅挂载时跑一次
```

三个必踩坑：

1. **首次挂载也执行一次**——`watch` 默认不 immediate，`useEffect` 天然 immediate
2. **漏写第二个参数（依赖数组）** → 每次渲染后都执行，不是"偶尔"，是每次
3. 组件函数体里不能直接 `await`——函数每次渲染都重跑，异步副作用一律放进 `useEffect`

**⑤ 派生值**：直接在渲染里算就有 `computed` 的效果；算得贵就 `useMemo(() => …, [deps])`。传给子组件的回调要保持引用稳定时用 `useCallback`。

**⑥ `useRef`** ≈ template ref：拿节点/组件实例，或存"变了但不想触发渲染"的可变值。少用。

**⑦ 受控表单——没有 `v-model`**，这个糖要自己手写：

```tsx
const [kw, setKw] = useState('');
<TextInput value={kw} onChangeText={setKw} />   // ≈ <input v-model="kw">
```

**⑧ 自定义 Hook ≈ composable**：`use` 前缀函数、内部可调其它 hooks（如 `useBleScan()` 返回 `{ devices, scanning, start }`）。

hooks 通用铁律：只能在组件（或另一个 hook）**顶层**调用，不能放进 `if` / 循环——React 靠调用顺序记忆每个 hook 的状态，顺序乱了状态就串了。

### 1.3 RN 核心组件速成

**没有 HTML，没有浏览器**。RN 内置组件直接映射到原生控件（鸿蒙上就是 ArkUI 控件）：

| 你想写的 | RN 里写 | 备注 |
|---|---|---|
| `<div>` | `<View>` | 布局容器，一切界面的骨架 |
| `<span>` / 任何文字 | `<Text>` | **裸文字必须包进 Text**，直接写在 View 里会报错——新手第一个错 |
| `<img>` | `<Image>` | `source={{ uri: 'https://…' }}` 或 `source={require('./x.png')}`；**必须显式给宽高** |
| `<button>` | `<Pressable>` | 自定义样式/手势都靠它；内置 `<Button>` 样式不可改，只适合原型 |
| `<input>` | `<TextInput>` | 受控用法见 §1.2 ⑦ |
| 页面级滚动 | `<ScrollView>` | 一次性渲染全部子节点，**不适合长列表** |
| 长列表 | `<FlatList>` | 自带虚拟滚动：`data` + `renderItem` + `keyExtractor`；用 `.map` 渲染上百条会卡 |

**样式 = JS 对象（CSS 的子集）**，复用靠抽变量/数组拼接（≈ 手写 class 绑定）：

```tsx
const s = StyleSheet.create({
  card: { padding: 12, borderRadius: 8, backgroundColor: '#fff' },
  row:  { flexDirection: 'row', gap: 8 },
});
<View style={[s.card, isDark && s.darkCard]}>…</View>
{/* 数组=合并，后者覆盖，假值自动忽略 */}
```

- flexbox **默认主轴是 column**（Web 默认 row）——布局反直觉的第一来源
- 尺寸全是无单位数字（密度无关像素 dp）；`'50%'` 是唯一合法的字符串形式
- 没有选择器/级联/继承/伪类；阴影、`zIndex` 等属性名与 Web 有出入，写之前查 RN 文档

组件可带平台分身文件（`.android.js` / `.harmony.js`），Metro 按目标平台选——§6.5/§6.7 的坑都源于三方库缺鸿蒙侧实现。

### 1.4 路由速成：react-navigation（Vue 视角）

RN 没有官方内置路由（§1.1 表里提过），事实标准是 **`@react-navigation`**（≈ vue-router）。它的栈导航器依赖两个带原生代码的库，在鸿蒙上必须装移植版并挂 har（§7 流程），否则白屏（§6.7 同根因）：

| vue-router | react-navigation |
|---|---|
| `createRouter({ routes })` + `app.use(router)` | `<NavigationContainer>` 包住整个应用（只包一次） |
| `<router-view>` | `<Stack.Navigator>`——自动渲染当前栈顶页 |
| 路由表 `routes: [{ path, component }]` | `<Stack.Screen name="Details" component={DetailsScreen} />` |
| `<router-link>` / `router.push('/details')` | `navigation.navigate('Details', { itemId: 42 })` |
| `router.back()` | `navigation.goBack()` |
| `useRoute().params` / `query` | `route.params`（栈导航传参就这一个口子） |
| 命名路由 `router.push({ name: 'x' })` | `navigate('Name')` 本身就是命名导航 |
| 嵌套 `<router-view>` | 没有对应单标签：嵌套 = Navigator 里再放 Navigator（Tab/Drawer 等） |

双页最小示例（跳转 + 传参 + 返回），与本项目后续要实现的路由同构：

```tsx
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Button, Text, View } from 'react-native';

type RootParams = { Home: undefined; Details: { itemId: number } | undefined };
const Stack = createNativeStackNavigator<RootParams>();

function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Details" component={DetailsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function HomeScreen({ navigation }: { navigation: any }) {
  return (
    <Button title="看详情"
      onPress={() => navigation.navigate('Details', { itemId: 42 })} />
  );
}

function DetailsScreen({ route, navigation }: { route: any; navigation: any }) {
  const itemId = route.params?.itemId;          // ≈ useRoute().params
  return (
    <View>
      <Text>itemId = {itemId}</Text>
      <Button title="返回" onPress={() => navigation.goBack()} />
    </View>
  );
}
```

两个与 vue-router 的行为差异值得知道：

- `navigate` 到栈里已存在的页面是**回退到它**（≈ push 带去重），不是压新页
- 系统返回手势/返回键自动等价 `goBack()`，不用自己接管（除非要自定义拦截）

（示例里 `navigation`/`route` 暂用 `any` 从简；真实项目用 `NativeStackScreenProps<RootParams, 'Details'>` 泛型配完整类型。）

---

## 2. 架构一图流

```
┌─ 你的电脑 ──────────────────────────────┐
│  Metro (pnpm start, :8098)              │
│   └─ 实时打包 index.js → JS bundle      │
└──────────────┬──────────────────────────┘
               │ hdc rport tcp:8098 tcp:8098（模拟器 localhost:8098 → 主机 8098）
┌──────────────▼──────────────────────────┐
│  模拟器中的应用                          │
│   ArkTS 壳 (RNAbility/RNApp)            │
│    └─ RNOH C++ 层 (libRNOHApp.so 等)    │
│        └─ Hermes 引擎执行 JS bundle     │
│            debug 模式：bundle 来自 Metro│
└─────────────────────────────────────────┘
```

- **debug 包**：JS 不打进 HAP，运行时从 Metro 拉取 → 改代码秒级生效
- **release 包**：JS 打进 HAP，不需要 Metro

---

## 3. 首次构建完整流程（每步都有坑，顺序别乱）

### 3.1 安装 JS 依赖

```bash
pnpm install
```

### 3.2 安装 ohpm 依赖（⚠️ 必须先关 Metro 和 DevEco！）

```bash
cd harmony
ohpm install --all
cd ..
```

> **为什么必须关 Metro**：Metro 的文件监视器会实时扫描项目根目录，
> 与 ohpm 解压/重命名 `oh_modules` 的操作抢文件，Windows 上表现为
> `EPERM: operation not permitted, rename ...`（见 §6.1）。

### 3.3 构建 + 安装 + 启动（用 --no-packager）

```bash
# pnpm run harmony 已内置 --port 8098 --no-packager（package.json scripts）
# ⚠️ Git Bash 下必须大写盘符 cd 且与命令同链，否则 hvigor 报 00303149 Path not found（§6.13）
cd "J:/Development/HarmonyOS/ds-connector/src" && pnpm run harmony
```

> **为什么要 `--no-packager`**：不加它，run-harmony 会**自动弹出一个独立
> Metro 控制台窗口**，时机恰在依赖安装之前——又回到 §6.1 的文件竞争。
> 我们自己控制 Metro 的启动时机。

这一步依次执行：`[1/3]` 依赖检查 → `[2/3]` hvigor 构建（ArkTS + C++/ninja）→ `[3/3]` hdc 安装并启动应用。
首次全量编译原生层约 2~6 分钟（arm64 有缓存后，x86_64 部分约 4 分钟）。

### 3.4 端口转发（模拟器访问主机的 Metro）

```bash
hdc fport rm tcp:8098 tcp:8098   # 若存在旧的 fport 正向规则会占用端口，先删
hdc rport tcp:8098 tcp:8098      # 反向端口：模拟器内 localhost:8098 → 主机 8098
```

> run-harmony 自己会做这一步（日志里 `Forwardport result:OK`）。手动调试时按上面两条来。
> **注意 rport 每次模拟器冷启动后需重新执行。**

### 3.5 启动 Metro

```bash
pnpm start        # 新开一个终端（端口 8098 已内置）；或加 -- --reset-cache 清缓存
```

### 3.6 加载 bundle

应用启动后自动连 Metro 拉取 bundle。首次打包 2~5 分钟（非 TTY 输出下进度条停在
`0%` 是正常的，**不要关窗口**）；完成后模拟器渲染界面，之后增量编译秒级。

改 JS 代码 → 模拟器自动热更新；或按大写 `R`（Metro 控制台内）全量 reload。

---

## 4. 日常开发循环

| 改动类型 | 操作 |
|---|---|
| JS/TS（App.tsx 等） | 保存即生效（HMR）；不行就 Metro 里按 `r`，或重启应用 |
| 新装 npm 三方库 | 有原生代码的库要走 §7 移植流程，然后重跑 §3.3 |
| 原生/CMake/依赖 | 重跑 `pnpm run harmony`（Git Bash 记得大写盘符同链，§6.13） |

---

## 5. 本项目相对模板改了什么（重要！）

| # | 文件 | 改动 | 原因 | 还原方式 |
|---|---|---|---|---|
| 1 | **SDK**: `...\openharmony\native\build-tools\cmake\bin\ninja.exe` | 1.12.0 → 1.13.2（官方版） | 旧 ninja 不声明 longPathAware，长路径 Stat 失败（§6.2） | 用同目录 `ninja.exe.bak` 覆盖回去 |
| 2 | `harmony/entry/build-profile.json5` | `externalNativeOptions` 加 `abiFilters: ["arm64-v8a", "x86_64"]` | 模拟器是 x86_64，只编 arm64 会启动即崩（§6.3） | 删掉该行（牺牲模拟器） |
| 3 | `harmony/entry/src/main/cpp/CMakeLists.txt` | `add_subdirectory(RNOH)` 前插入 `ffrt::ffrt_cpp` IMPORTED 目标（带 `if(NOT TARGET)` 保护） | hvigor 对 x86_64 不注入 ffrt cmake 包，RNOH 链接失败（§6.4） | 备份在 `CMakeLists.txt.bak-ffrt-patch` |
| 4 | `metro.config.js` | 按 RNOH 官方模板引入 `createHarmonyMetroConfig` + 自定义 `blockList` | harmony 平台解析规则缺失（§6.5）；文件监视器崩（§6.6） | 备份在 `metro.config.js.bak` |
| 5 | `App.tsx` | 先临时最小化（一个 Text）排障，2026-11-10 起改为 **Tab 应用根组件**（SafeAreaProvider + NavigationContainer） | 原模板用了 safe-area-context，无移植版时白屏（§6.7）；移植版装好后直接演进为 Tab 应用（§0） | 原模板备份在 `App.tsx.bak-template` |
| 6 | 注册表 | `LongPathsEnabled=1` | 260 字符路径限制 | — |
| 7 | `package.json` | 新增 `@react-navigation/native` + `@react-navigation/bottom-tabs`（v7，纯 JS，2026-11-10） | 底部 Tab 导航（§1.4、§6.13）；原生依赖的移植版早已装齐（§6.9） | 删掉这两个依赖 |
| 8 | `src/navigation/`、`src/screens/` | 新增 `RootTabNavigator.tsx` + `HomeScreen/DataScreen/SettingsScreen.tsx` | Tab quick start 的路由表与三个页面 | 直接删除（骨架目录原本就是空的） |

生成的调试产物（可随时删）：`rn-harmony-build.log`、`metro.log`、`metro.log.prev`。


---

## 6. 踩坑全记录（六大坑，按出现顺序）

### 6.1 ohpm 安装 `EPERM: operation not permitted, rename`

- **症状**：`ohpm install` 把 `.ohpm` 里的包重命名到最终位置时失败，且每次都挂在同一个目标上。
- **根因**：Metro（尤其 run-harmony 自动弹起的那个）在扫描 `harmony/oh_modules`，与 ohpm 的 rename 抢文件；Windows 上文件句柄占用表现为 EPERM。
- **解法**：装依赖前关掉 Metro 与 DevEco Studio；手动 `ohpm install --all` 后再用 `--no-packager` 构建；首次失败残留的 `harmony\oh_modules` 整个删掉重来。

### 6.2 ninja 报 `Filename longer than 260 characters`

- **症状**：`BuildNativeWithNinja` 阶段报 `ninja: error: Stat(...HostPlatformScrollViewProps.h): Filename longer than 260 characters`（RNOH CLI 只显示 `undefined`，真实错误要看完整日志或 DevEco 构建）。
- **根因**：RNOH 源码路径极深（示例文件全路径 265 字符）。Windows 需"注册表长路径 + 程序自身声明 longPathAware"两者同时满足；SDK 自带 ninja 1.12.0 没有声明，注册表开了也没用。
- **解法**：把 SDK 的 ninja 换成官方 **1.13.x**（带 longPathAware 清单），原文件备份。下载地址：`https://github.com/ninja-build/ninja/releases`（ninja-win.zip，用 PowerShell `Expand-Archive` 解压——Git Bash 的 tar 不认 zip）。
- **验证**：`ninja --version` 显示 1.13.x；重跑构建，ninja 阶段 2 分钟级别正常通过。
- **2026-11-16 追记**：2026-11-12 升级 DevEco Studio 26.0.0 后，新 SDK（`J:\Development\sdk-ohos\26.0.0`）
  **自带 ninja 1.13.2**，本坑开箱即满足，无需再手动替换；上文的旧 SDK 路径与备份 `ninja.exe.bak` 已随旧安装作废。
  今后升级 DevEco 仍需核对自带 ninja ≥ 1.13（260 字符问题的判据不变）。

### 6.3 应用启动即崩溃循环（`libRNOHApp is undefined`）

- **症状**：`aa start` 成功但进程几秒内消失，Metro 收不到任何 bundle 请求；faultlogger 里成堆 `jscrash-com.yuban32.dshconnector...log`。
- **根因**：`Error message: Couldn't create bindings between ETS and CPP. libRNOHApp is undefined`，设备 `CpuAbi: x86_64`，而 HAP 只含 arm64-v8a 原生库。
- **定位方法**：读崩溃文件
  ```bash
  hdc shell "cat $(ls -t /data/log/faultlog/faultlogger/jscrash-com.yuban32.dshconnector* | head -1) | head -60"
  ```
- **解法**：`harmony/entry/build-profile.json5` 的 `externalNativeOptions` 加 `abiFilters: ["arm64-v8a", "x86_64"]`。

### 6.4 x86_64 配置报 `ffrt::ffrt_cpp target not found`

- **症状**：加 x86_64 后 CMake 阶段大面积报 `Target "reactnative" links to: ffrt::ffrt_cpp but the target was not found`。
- **根因**：RNOH 用 `@ppd/ffrt` 包提供 `ffrt::ffrt_cpp`（模拟器兼容 shim），hvigor 通过**按架构 staged cmake 包**（`.cxx/.../hvigor/<arch>/lib/<triple>/cmake/ffrt`）注入，但 x86_64 构建链没有正确传入 → 目标没人创建。arm64 有缓存掩盖了问题。
- **解法**：在 `entry/src/main/cpp/CMakeLists.txt` 里、`add_subdirectory("${RNOH_CPP_DIR}" ./rn)` **之前**手动创建该导入目标（本项目已加，带 `if(NOT TARGET)` 保护，两架构通用）。

### 6.5 JS 侧报 `Unable to resolve module .../ReactDevToolsSettingsManager`

- **症状**：Metro 打包失败，报从 `@react-native-oh/react-native-harmony/Libraries/Core/setUpReactDevTools.js` 无法解析 `../../src/private/devsupport/rndevtools/ReactDevToolsSettingsManager`。
- **根因**：项目用的是 RN 默认 metro.config.js，缺 RNOH 的 harmony 平台解析规则（harmony 平台的裸 require 需要 fallback 机制）。
- **解法**：按 RNOH CLI 的官方模板重写 metro.config.js——关键是引入
  `createHarmonyMetroConfig`（来自 `@react-native-oh/react-native-harmony/metro.config`），见 §3.5 前的本项目最终版 metro.config.js。
- **重要**：改完配置必须**彻底重启 Metro**（杀掉所有 node 实例再起一个）；旧实例占着 8081 时新实例会挪到 8082，应用连的还是旧配置。

### 6.6 Metro 自己崩溃（`FallbackWatcher ... ENOENT ... watch`）

- **症状**：打包过程中 Metro 进程直接退出，日志尾部是 `metro-file-map` 的 `ENOENT`，path 指向 `.cxx\...\CMakeScratch\TryCompile-*`。
- **根因**：Metro 全量 watch 项目目录，CMake try-compile 的临时目录建了又删，watcher 撞上已删除路径就崩。
- **解法**：metro.config.js 里加 `blockList` 排除 `harmony` 的构建产物目录（`.cxx`、`build`、`oh_modules` 等）。本项目已加。

### 6.7 白屏（bundle 加载成功但界面空白）

- **症状**：应用存活、Metro 显示 bundle 已服务、无崩溃，但模拟器白屏。
- **根因**：模板 App.tsx 依赖 `react-native-safe-area-context`，该库在 HarmonyOS 需要原生移植版（`@react-native-oh-tpl/...`）；未安装时 JS 调用其 API 失败 → 白屏。Metro 日志中的
  `No harmony-specific third-party packages have been detected` 就是提示。
- **快速验证法**：把 App.tsx 换成纯 RN 组件（Text/View），若能渲染即证明管线正常、问题在三方库。
- **彻底解法**：见 §7。

### 6.8 Metro 闪退：`listen EACCES: permission denied 0.0.0.0:8081`（端口被系统排除段吞掉）（2026-11-10）

- **症状**：Metro 窗口秒关；`run-harmony` 自动拉起的 Metro 窗口也闪退；`netstat` 查 8081 却没人监听。
- **根因**：Hyper-V/WSL 的 WinNAT 动态排除段随重启漂移，`netsh interface ipv4 show excludedportrange protocol=tcp` 可见 `7997–8096` 段把 8081/8082 都吞了，绑定即 EACCES。
- **解法**：端口已固定为 **8098**（package.json scripts 内置，`pnpm start`/`pnpm run harmony` 直接可用）；8097–8208 是当前空档。要拿回 8081 需管理员执行 `net stop winnat && net start winnat`（重启后可能复发，不推荐依赖）。
- **附带坑 1**：`pnpm start -- --port 8098` 的 `--` 会被 pnpm 原样透传成位置参数，commander 直接忽略 → 端口"看似传了其实没传"。端口写死在 scripts 里就是为了绕开这个。
- **附带坑 2**：`run-harmony` 检测不到可用 Metro 时会**自己开新终端窗口拉起 Metro**（`startServerInNewWindow`）——你看到的"外置终端闪退"就是它在 8081 上 EACCES 秒关。且它的检测逻辑（`findDevServerPort`）对已在运行的 Metro 可能误判为"Another process is running"并交互式要求换端口。所以 scripts 的 harmony 命令加了 `--no-packager`：Metro 完全由你自己管（§3.5）。

### 6.9 RNOH core 漂移到 0.84.5 后启动即 cppcrash（2026-11-10）

- **症状**：`RNInstanceInternal::initialize()` SIGSEGV 空指针，启动 3 秒内崩，复现率 100%；bundle 请求根本发不出来。
- **根因**：`^0.84.3` 被 `pnpm install` 漂移到 0.84.5（第三方 fork 发布，非 openharmony-sig 官方）。钉回 `0.84.3` 后立即恢复。
- **规则**：RNOH core **与 CLI** 必须精确钉版本（不带 `^`；CLI 漂移会连带 hvigor-plugin 换版本，见 §6.13 附带记录）。
  三方库上游/移植版配对（已验证可用）：
  上游 `react-native-screens` = **4.26.2**（移植版 peer 精确要求）、`react-native-safe-area-context` = **5.6.2**、
  `react-native-gesture-handler` = **2.33.0** + 移植版 `@react-native-ohos/react-native-gesture-handler` = **2.31.0-beta.1**（dist-tag `rnoh0.84`，其 peer 指明要上游 2.33.0）、
  `react-native-reanimated` = **4.5.3** + 移植版 `@react-native-ohos/react-native-reanimated` = **4.1.0-beta.1**、
  `react-native-worklets` = **0.11.4** + 移植版 `@react-native-ohos/react-native-worklets` = **1.1.0-beta.1**（配对查法见 §6.14）。

### 6.10 新增 RN 库后第一次构建必报 `Cannot find module '@react-native-ohos/...'`

- **根因**：`run-harmony` 内部顺序是 [1/3] `ohpm install --all` → [2/3] hvigor 构建内才跑 autolinking（写 oh-package.json5 + 生成 RNOHPackagesFactory.ets）。新库的 har 永远晚 ohpm 一步。
- **解法**：装完新库先手动 `cd harmony && ohpm install --all` 再构建；或连跑两次 `pnpm run harmony`。
- 新库的 har 若想预装（跳过失败的一跑）：在 `harmony/oh-package.json5` 的 dependencies 手动加一行
  `"@react-native-ohos/<包名>": "file:../node_modules/@react-native-ohos/<包名>/harmony/<xxx>.har"`（har 内部 ohpm 包名可用 `tar -xzOf <xxx>.har package/oh-package.json5` 查看）。

### 6.11 Metro 运行期间动了 node_modules → 解析错乱（文件明明存在却报 Unable to resolve）

- **根因**：pnpm install 换血 node_modules 时，Metro 的 haste/delta 缓存仍指向被删的旧目录（报错路径会指向 `.pnpm` 真实目录）。
- **解法**：`pnpm add` / `pnpm install` 之后**重启 Metro 并加 `--reset-cache`**；原则上 Metro 起着的时候不动依赖。

### 6.12 index.js 误用 `enableScreens(App)` 把整条 screens 依赖链拖进 bundle（2026-11-10）

- **症状**：bundle 编译报 `Unable to resolve react-native-gesture-handler` / `react-native-reanimated`（来自上游 screens 的 `src/gesture-handler/` 胶水文件）。
- **根因**：index.js 里错误地写了 `enableScreens(App)`（该 API 接收布尔值，不是组件包装器），一行 import 把 screens → RNGH → reanimated 全链拉进 bundle。已恢复标准模板写法。
- **教训**：最小 App 阶段不要 import screens；真接 react-navigation 时按 §6.9 配对规则装齐。
  （2026-11-10 实测修订：`@react-navigation/bottom-tabs` v7 的 peer 依赖虽然只列 screens 与 safe-area-context、
  不列 reanimated，但上游 `react-native-screens` 4.26.2 的 `src/gesture-handler/ScreenGestureDetector.tsx`
  会**无条件 import** `react-native-reanimated`，而该文件会被 react-navigation 的引用链拖进 bundle——
  所以接 react-navigation（哪怕只用 bottom-tabs）就**必须**装 reanimated 移植版 + worklets，安装步骤见 §6.14。）

### 6.13 Git Bash 里跑 run-harmony：hvigor 报 `00303149 Path not found`（盘符大小写）（2026-11-10）

- **症状**：`run-harmony` 在 [2/3] 构建开始几十毫秒即失败：
  `hvigor ERROR: 00303149 Configuration Error — Path not found. At file: <项目>\harmony\entry`，
  提示检查 `build-profile.json5` 的 `modules` 字段——**但那个目录明明存在**。
- **根因**：hvigor 在 init 阶段对每个 module 做校验
  `fs.existsSync(p) && fs.realpathSync.native(p) === p`——后者是**大小写敏感的字符串全等比较**。
  Windows 的 `realpathSync.native` 返回规范化的**大写盘符**（`J:\...`），而从 **Git Bash** 起的构建，
  子进程拿到的 cwd 是**小写盘符**（`j:\...`，msys 的特性）。二者字符串不等 → 误报"路径不存在"。
  报错指向的 modules/srcPath 是幌子，与目录内容无关。
- **解法**：让构建进程运行在大写盘符 cwd 下——Git Bash 里先 `cd "J:/Development/..."`（大写写法，
  会原样传给子进程，`node -e "console.log(process.cwd())"` 可验证）；或直接用 CMD / PowerShell / DevEco 终端跑（天然大写）。
  注意：独立开的终端/CI/后台任务初始 cwd 仍是小写形式，`cd` 必须与构建命令写在**同一条命令链**里
  （`cd "J:/..." && npx react-native run-harmony ...`），换个窗口先 cd 过再跑不算数。
- **附带**：排障过程中曾怀疑是 `@react-native-oh/react-native-harmony-cli` 从 `^0.84.3` 漂移到 0.84.5 所致
  （§6.9 同一个第三方 fork 版本线），钉回精确 `0.84.3` 后**同样报错**——证明与本坑无关。但按 §6.9
  "官方系包一律精确钉版本"的规则，CLI 保留在 `0.84.3`；注意 `harmony/hvigor/hvigor-config.json5` 里
  `@rnoh/hvigor-plugin` 指向的 tgz 文件名须与 CLI 实际版本一致（`rnoh-hvigor-plugin-0.84.3.tgz`）。
- **教训**：hvigor 报"Path not found"先别急着去查那个路径——先确认 shell 环境的 cwd 盘符大小写
  （`node -e "console.log(process.cwd())"` 一秒出答案）。在大小写不敏感的 NTFS 上做字符串全等比较，是误报重灾区。

### 6.14 接 react-navigation 必装：reanimated 移植版 + worklets（2026-11-10）

接上 §6.12 的实测：bundle 打包报 `Unable to resolve module react-native-reanimated`
（来自上游 screens 的 `src/gesture-handler/ScreenGestureDetector.tsx`）。安装配方（版本已验证配对）：

```bash
# 1) 关 Metro！然后四个包一起装，全部精确钉版本（§6.9 规则）：
pnpm add react-native-reanimated@4.5.3 react-native-worklets@0.11.4 \
         @react-native-ohos/react-native-reanimated@4.1.0-beta.1 \
         @react-native-ohos/react-native-worklets@1.1.0-beta.1
# 配对依据：两个移植版 peer 精确要求 react 19.2.3 / react-native 0.84.1 / 上游 4.5.3 / 0.11.4

# 2) babel.config.js 加 worklets 编译插件（reanimated 4 必需，必须放 plugins 最后）：
#    plugins: ['react-native-worklets/plugin']

# 3) harmony/oh-package.json5 挂两个 har（dependencies）：
#    "@react-native-ohos/react-native-reanimated": "file:../node_modules/@react-native-ohos/react-native-reanimated/harmony/reanimated.har",
#    "@react-native-ohos/react-native-worklets":  "file:../node_modules/@react-native-ohos/react-native-worklets/harmony/worklets.har"

# 4) 关键坑：同一文件的 overrides 里也要加 worklets（reanimated.har 内部声明
#    "@react-native-ohos/react-native-worklets": "file:../worklets" 是按移植者仓库布局写死的，
#    直接装会报 00617301 Fetch local folder package error .../@react-native-ohos/worklets does not exist；
#    overrides 按包名替换解析，绕开这个死路径）：
#    "overrides": { "@react-native-ohos/react-native-worklets": "file:../node_modules/.../worklets.har" }

# 5) ohpm install --all（Metro 已关）→ 重跑 run-harmony（§3.3）
# 6) pnpm 改过 node_modules：Metro 重启要 --reset-cache（§6.11）
```

- **教训**：查移植版配对版本不要靠猜——`npm view <移植版>@<版本> peerDependencies`，peer 里精确写的
  上游版本就是要钉的版本；没有对应 dist-tag（如 `rnoh0.84`）时选 peer 与本项目 react/RN 版本完全一致的那个。
- 注意区分：`@react-navigation/*`（native / bottom-tabs 等）本身是**纯 JS 包**，没有 harmony har，
  不需要 ohpm 步骤；需要走 ohpm + 原生重建的只有它拖进 bundle 的三方原生库（screens / safe-area /
  RNGH / reanimated / worklets，见 §6.10）。

### 6.15 升级 DevEco 后 ninja 报 `undefined`：.cxx 旧缓存钉死了已消失的编译器路径（2026-11-16）

- **症状**：`pnpm run harmony` 在 [2/3] 报 `Exceptions happened while executing ...ninja.exe -C ...arm64-v8a`，错误对象是 `undefined`，无任何具体输出（CLI 吞掉了 ninja stderr，§6.2 同款毛病）。
- **根因**：`.cxx/` 缓存是升级前 SDK 构建的，CMakeCache.txt 里写死了旧编译器路径
  （本项目实测：`sdk\default\hms\native\BiSheng\bin\clang.exe`——`hms` 组件在 DevEco 26 新 SDK 里已不存在）。
  新旧 SDK 的 CMake 恰好同版本（3.28.2）时 CMake 认为缓存有效，**不会自动重新配置**，死路径被一直沿用。
- **解法**：删 `harmony/entry/.cxx/`（必要时连 `entry/build/`）后重建；首次全量重配 + 双 ABI 约 5~8 分钟。
- **教训**：**大版本升级 DevEco / 换 SDK 后，第一件事就是清 `.cxx`**——缓存里的工具链绝对路径比 CMake 版本号更先失效。
  （本次 2026-11-16 实测：清缓存后 junction 兼容层 + 新 SDK 构建安装启动全链路通过，见 §1 环境表。）

### 6.16 双模拟器陷阱：run-harmony 在设备"不可见"时自动再开一台（2026-11-18）

- **症状**：跑 `pnpm run harmony` 时凭空多出**第二个模拟器窗口**；随后 Metro 报
  `No apps connected. Sending "reload" to all React Native apps failed`，按 `r` 无效。
- **根因**（读 CLI 源码 `react-native-harmony-cli/dist/commands/run-harmony.js` + `simulator/LaunchSimulator.js` 确认）：
  run-harmony 开始时若 `hdc list targets` 里没有 state 为 `Connected` 的设备，
  会调 `launchHarmonySimulator` 自动拉起模拟器——**永远取 `Emulator.exe --list`
  输出的第一台**（本机 = Mate 80 RS），并盲目假定它在 `127.0.0.1:5555`。
  而模拟器**窗口弹出 ≠ hdc 可见**：从启动到向 hdc 注册要 1~3 分钟（实测 60s+
  输出为空），之后才短暂经过非 Connected 状态进入 Connected。在窗口期跑构建命令
  = 让 CLI 误判"零设备"，再开一台；两台在线时所有不带 `-t` 的 `hdc` 命令
  （rport、aa start）报错失效，应用可能装进你没在看的那台。
- **连带效应**：debug 包 rawfile 无兜底 bundle（`hermes_bundle.hbc` 只在 release
  bundle 时生成），应用启动时若 rport 尚未建上（连错设备 / §3.4 没做 /
  CLI 自带 rport 与 `aa start` 的竞速输了），三级 bundle provider 全失败 →
  无界面、无 HMR WebSocket → Metro 永远 "No apps connected"，**不自愈**。
- **解法**：铁律——`hdc list targets` **有输出之前不跑任何 hdc / 构建命令**；
  中招后两台全关、只开一台、等注册、重跑。多台在线时用
  `--simulator 127.0.0.1:5555` 显式指定。已建好转发后仍连不上时，
  `aa force-stop` + `aa start` 重启应用即可（第二次启动就能拉到 bundle）。
  详细专修流程见[开发环境启动教程.md](开发环境启动教程.md) §7。
- **教训**：CLI 的自动拉起是为"没开模拟器"场景设计的便利功能，但它的设备选择
  （`--list` 第一行）和端口假定（5555）在多实例机器上不可靠；本项目纪律是
  **模拟器永远手动从 Device Manager 开、且开机完成前构建命令不碰**。

### 6.17 hdc 服务端起不来：8710 被 WinNAT 排除段吞掉，hdc 静默失败（2026-11-18）

- **症状**：模拟器在 Device Manager 里明明开着，`hdc list targets` 却**没有任何输出**（连
  `[Empty]` 都没有）；所有 hdc 命令（rport / aa start / file send）exit 0、零输出、
  什么都没做。下游连锁反应极具迷惑性：`run-harmony` 拿到空设备列表 → 自动拉起第二台
  模拟器（§6.16）→ `[3/3] installing and opening app` 里的 hdc 全部空跑，但 CLI 只认
  `[Fail]` 前缀，**空输出不算失败 → "finished" 是假的** → Metro 永远 No apps connected。
- **根因**：hdc 客户端发现服务端（默认端口 **8710**）不存在时会自启服务端；本机 WinNAT
  动态排除段 `8644–8743` 覆盖了 8710，服务端 `uv_tcp_bind -4092 permission denied`
  绑定失败退出，客户端重连 7 次被拒后**静默放弃**（exit 0、无输出）。与 §6.8 的 Metro
  8081 被吞是同一机制的新受害者——排除段随重启漂移，谁都有可能撞上。
- **诊断**（hdc 假死的两面：输出为空 ≠ 设备为空）：
  ```bash
  hdc -l5 list targets        # verbose 日志里找 uv_tcp_bind -4092 / SetTCPListen failed
  netsh interface ipv4 show excludedportrange protocol=tcp   # 8710 是否落在某个段里
  ```
- **解法**（两步，第一步立即可用，第二步持久）：
  ```bash
  # 管理员终端：
  net stop winnat                                    # ① 解除排除段，hdc 服务端立刻能绑上 8710
  hdc list targets                                   #    任意一条 hdc 命令触发服务端自启；模拟器秒注册
  netsh int ipv4 set dynamic tcp start=49152 num=16384   # ② 动态段缩到 49152+，低位端口永绝后患
  net start winnat                                   # ③ 恢复 NAT；已建立的绑定不受影响，排除段按新范围重排
  ```
  实测：`net start winnat` 后排除段不再覆盖 8xxx，hdc 服务端（已持 8710）继续存活。
  ②持久生效（重启后排除段从 49152 起排），但 **Windows 大版本更新可能重置该设置**，
  复查方法：排除段列表里是否重新出现低于 49152 的段。
- **教训**：**hdc 的空输出是最大的谎言**——它失败时不报错、退出码还是 0。任何 hdc
  命令"成功"后都要用下一个命令的输出闭环验证（`fport ls`、`bm dump -n <包名>`），
  永远不要把空输出当成功；CI/脚本里更要把"输出为空"当失败处理。

### 6.18 `rport` 报 `TCP Port listen failed`：模拟器内的孤儿 hdcd 监听（2026-11-18）

- **症状**：`hdc rport tcp:8098 tcp:8098` 报 `[Fail]TCP Port listen failed at 8098`，
  但 `fport ls` 是 `[Empty]`，host 侧 8098（Metro）明明……或明明没被占都无所谓——
  **rport 的监听端在模拟器内部**（实测：host 上建 `tcp:18099 tcp:8098` 规则成功且
  host 侧 18099 无人监听；失败与否只取决于模拟器里该端口是否被占）。
  进模拟器 `netstat -tln` 可见 `127.0.0.1:8098 LISTEN` + 一堆 `CLOSE_WAIT`。
- **根因**：host 侧规则消失（hdc 服务端被 kill/重启、或 `fport rm` 过）时，
  设备端 hdcd 的监听**不会跟着释放**（CLOSE_WAIT 堆积证明其套接字卫生极差），
  成为孤儿：host 表删不到（`fport rm` 报 rule is not exist）、shell 权限杀不了
  hdcd（pid 属系统，Permission denied）、`tconn -remove` 重连也不清。
- **解法**：**重启模拟器**（唯一可靠路径，实测重启后 8098 干净、rport 立即成功）。
  预防：不要在模拟器运行中 kill hdc 服务端；要动服务端先 `hdc fport rm` 清规则。
- **连带修正**：hdc 3.2.0f **没有 `rport rm` / `rport ls` 子命令**（报 Incorrect
  forward command），列与删一律用 `fport ls` / `fport rm`（`fport rm` 同时删除
  正向与反向规则，run-harmony 内部就是这么清的）。本教程 §3.4 的写法是对的，
  早期把 `fport rm` 误写为 `rport rm` 的记录以本条为准。
- **教训**：hdc 的规则表是 host 与 device 两份的，靠隧道维持一致；任何一侧异常
  退出都会造成"看不见的占用"。转发建不上时，第一反应应是进模拟器看
  `netstat -tln`，而不是在 host 侧反复重试。

---

## 7. 下一步：安装 safe-area-context 鸿蒙移植版并还原原版 App

```bash
# 1) 安装 JS 侧移植包（版本需与 RN 0.84 兼容，具体版本号以 RNOH 官方文档的三方库适配表为准）
pnpm add @react-native-oh-tpl/react-native-safe-area-context

# 2) 在 harmony/entry/oh-package.json5 的 dependencies 里添加（file: 路径指向移植包自带的 har）：
#    "@react-native-oh-tpl/react-native-safe-area-context":
#      "file:../node_modules/@react-native-oh-tpl/react-native-safe-area-context/harmony/react_native_safe_area_context.har"

# 3) 安装 ohpm 依赖（先关 Metro！）
cd harmony && ohpm install --all && cd ..

# 4) 重新构建安装
npx react-native run-harmony --no-packager

# 5) 起 Metro，重启应用

# 6) 还原原版 App
cp App.tsx.bak-template App.tsx
```

其他 RN 三方库同理：查 RNOH 文档的适配列表（`@react-native-oh-tpl/<库名>`），
JS 装移植包 + oh-package.json5 挂 har + 重建。

---

## 8. 命令速查

```bash
# 依赖（先关 Metro/DevEco）
pnpm install
cd harmony && ohpm install --all && cd ..

# 构建+安装+启动（不自动起 Metro；端口已在 package.json scripts 里固定为 8098）
# 注意 Git Bash 下必须用大写盘符 cd 且与命令同链，否则 hvigor 报 00303149 Path not found（§6.13）
cd "J:/Development/HarmonyOS/ds-connector/src" && pnpm run harmony
npx react-native run-harmony --port 8098 --no-packager --verbose   # 带详细日志

# Metro
pnpm start                        # 起 dev server (8098，scripts 已内置端口)
pnpm start -- --reset-cache       # 清缓存重启（解析异常时用；pnpm 会把 -- 原样透传，无害）

# 设备/应用
hdc list targets                                           # 在线设备
hdc shell aa start -a EntryAbility -b com.yuban32.dshconnector
hdc shell aa force-stop com.yuban32.dshconnector
hdc rport rm tcp:8098 tcp:8098 ; hdc rport tcp:8098 tcp:8098   # 端口转发（rport 在模拟器冷启动后需重加）

# 排查
hdc shell "pidof com.yuban32.dshconnector"            # 进程号
hdc shell "hilog -x | grep -iE 'rnoh|ReactNativeJS'"       # RNOH/JS 日志
hdc shell "ls -t /data/log/faultlog/faultlogger/ | head"   # 崩溃记录
tail -f rn-harmony-build.log                               # 构建日志
tail -f metro.log                                          # Metro 日志
```

---

## 9. 故障排查决策树

```
应用没起来？
├─ hdc 命令零输出 / list targets 空 → hdc 服务端死了：§6.17（8710 被吞，stop winnat 复活）
├─ Metro 显示 No apps connected → 按序查：hdc 只一台设备？pidof 活着？fport ls
│    有 [Reverse] 规则？都正常→force-stop 后 aa start 重启应用（§6.16，多数在此痊愈）
├─ 启动后秒退 → 查 jscrash：
│    ├─ libRNOHApp is undefined → ABI 不匹配（§6.3）
│    └─ 其他 → 读崩溃文件定位
├─ 白屏、应用存活 → bundle 是否送达？
│    ├─ Metro 无请求 → 端口转发断了（§3.4）/ Metro 没起 / 连错实例（§6.5）
│    ├─ Metro 报 Unable to resolve → metro.config 缺 RNOH 规则（§6.5）
│    └─ bundle 正常仍白屏 → 三方库无移植版（§6.7/§7）
└─ ohpm EPERM → 关 Metro/DevEco，删 oh_modules 重装（§6.1）

原生构建失败？
├─ Filename longer than 260 → ninja 版本（§6.2）
├─ ffrt::ffrt_cpp not found → ffrt shim（§6.4）
└─ 卡在 Re-running CMake 循环 → 删 harmony/entry/.cxx 重新构建
```

---

## 10. 版本信息备忘

- React Native 0.84.1 / Metro 0.83.8 / React 19.2.3
- RNOH `@react-native-oh/react-native-harmony` **0.84.3**（钉死）+ CLI `react-native-harmony-cli` **0.84.3**（钉死，见 §6.13）
- react-navigation v7（纯 JS）：`@react-navigation/native` **7.5.1** + `@react-navigation/bottom-tabs` **7.21.0**
- reanimated/worklets 配对（§6.14）：上游 **4.5.3 / 0.11.4** + 移植版 **4.1.0-beta.1 / 1.1.0-beta.1**
- DevEco 模拟器镜像 6.1.0.126（x86_64），hvigor 6.24.4
- DevEco Studio 26.0.0（2026-11-12 升级），SDK 独立于 `J:\Development\sdk-ohos\26.0.0`；SDK 自带 ninja 1.13.2（旧手动替换已作废，见 §6.2 追记）
- 本教程整理日期：2026-11-04（11-05 补 §1.2–§1.4；11-10 接入 Tab 导航 quick start，补 §6.13、§6.14；11-16 修正早期段落的 8081 端口与 `src/MyRNProject084` 路径残留为现行值 8098 / `src/` 项目根；同日项目改名 **DSH Connector**（原名 MyRNProject084），删除 android/ios 未使用模板壳，补 §6.15；11-18 补 §6.16 双模拟器陷阱与 No apps connected 专修，同日补 §6.17 hdc 8710 被 WinNAT 排除段吞掉（已做动态端口范围持久修复）与 §6.18 孤儿 hdcd 监听致 rport listen failed，并修正 fport ls/rm 语法）
