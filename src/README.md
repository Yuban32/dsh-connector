# DS Connector 手机端 · RN 应用工程

React Native 0.84 + RNOH（`@react-native-oh/react-native-harmony` 0.84.3）工程。本目录即 RN 项目根；`harmony/` 是可独立用 DevEco Studio 打开构建的鸿蒙壳工程。应用包名 `com.yuban32.dshconnector`。

## 文档（都在本目录）

| 文档 | 用途 |
|---|---|
| [开发环境启动教程.md](开发环境启动教程.md) | **把模拟器 + Metro 调试链跑起来（从这开始）** |
| [RN-HarmonyOS-入门教程.md](RN-HarmonyOS-入门教程.md) | 入门教学（含 React/RN 零基础速成）+ 踩坑全记录（§6）+ 排错决策树（§9） |
| [移动开发规范.md](移动开发规范.md) | 写组件 / 接三方库 / 调试的约定（Vue 开发者视角） |
| [项目目录架构设计.md](项目目录架构设计.md) | 目录结构、双包管理器、构建流水线、产物缓存、禁改清单 |

## 常用命令

```bash
pnpm start          # Metro dev server（端口 8098，已内置在 scripts）
pnpm run harmony    # 构建 + 安装 + 启动（= run-harmony --port 8098 --no-packager）
                    # ⚠️ Git Bash 下需大写盘符 cd 且与命令同链，见开发环境启动教程 §0
pnpm run lint
pnpm test
```

## 目录速览

- `App.tsx` 根组件（SafeAreaProvider + NavigationContainer + Tab 导航）
- `src/screens/` 页面、`src/navigation/` 路由；存放规则见[移动开发规范.md](移动开发规范.md) §3
- `harmony/` 鸿蒙壳（ArkTS/C++），依赖挂载与禁改清单见[项目目录架构设计.md](项目目录架构设计.md) §7
