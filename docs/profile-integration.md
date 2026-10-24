# 接入 DeepSeek Harness profile（可逆）

## 前置

- Node ≥ 22、pnpm ≥ 10（harness 自带 pnpm 11 执行实际安装，两者锁文件格式兼容）
- 本仓库已 `pnpm build`

## 接入

**日常开发一条命令**（构建 + 用 harness 自带 pnpm 重装进 profile）：

```bash
cd /j/Development/HarmonyOS/ds-connector
pnpm push        # 之后重启 DeepSeek Harness 生效
```

首次接入的完整步骤（`pnpm push` 已覆盖其中 3/5 步）：

```bash
# 1. 构建并自测
cd /j/Development/HarmonyOS/ds-connector
pnpm install && pnpm build && pnpm test

# 2. 备份 profile 锁文件
cd ~/.dsh/profiles/desktop
cp pnpm-lock.yaml pnpm-lock.yaml.bak-ds-connector

# 3. 以 file: 协议安装 —— 必须用 harness 自带的 pnpm 11
#    （本地 pnpm 10 会因 store v10/v11 冲突报错；file: 是拷贝，改码后需重装）
node "J:/Development/Program Files/Deepseek Harness/resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.cjs" add "file:J:/Development/HarmonyOS/ds-connector"

# 4. 编辑 ~/.dsh/profiles/desktop/package.json，把 "@ds-connector/connector"
#    加入 "dsh".profile.bundles 数组（保留既有条目；默认端口不同，可共存）

# 5. 重启 DeepSeek Harness
```

## 方式 B：经 GitHub repo URL 分发（多机安装）

git URL 安装的机制：目标机克隆仓库 → **按仓库现状直接打包安装，不执行任何构建**。因此 `dist/` **必须已提交进仓库**（本项目自 0.1.2 起提交），目标机零构建、零工具链依赖。

发布流程（开发机）：

```bash
pnpm build && pnpm test   # 保证 dist 最新且测试绿
git add -A && git commit -m "release x.y.z"   # 必须包含 dist 的变更
git push
```

**忘记提交 dist 是历史事故的根源**（0.1.1 及之前 dist 被 .gitignore 排除，目标机装到的包缺入口文件，报 ENOENT/ERR_MODULE_NOT_FOUND）。

目标机安装/更新：

```bash
# 清掉旧拷贝（harness 关闭状态）
Remove-Item -Recurse -Force "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\@ds-connector"
# 从 GitHub URL 重装（在 profile 目录下，用 harness 自带 pnpm）
node "<harness>/resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.cjs" add <github 用户>/<仓库>
# 重启 harness，curl /state 里的 version 应为新版本号
```

版本号即"内容指纹"：每次发布升版本（package.json + src/metadata.ts 两处），目标机凭 `/state` 的 version 判断装没装对。



```bash
# 1. 数据目录生成 = apply() 已执行（最主要的加载证据）
ls ~/.dsh/profiles/desktop/.ds-connector/vault-v1/
#   期望: host-key.json  vault.json  diagnostics.json

# 2. 回环控制面应答
curl http://127.0.0.1:28471/state

# 3. 完整入网闭环（在本仓库执行）
pnpm smoke
```

日志位置（按有用程度排序）：

1. `~/.dsh/profiles/desktop/.ds-connector/vault-v1/diagnostics.json` — 本插件自身事件
2. `~/.dsh/profiles/desktop/.plugin-manager/logs/operation-*/pnpm.log` — 安装侧
3. `%APPDATA%/@deepseek-ai/dsh-desktop/logs/` — 应用日志（当前版本在本机为空目录）

## 配置

优先级：Cordis 节点 config > 环境变量 > 默认值。

Cordis 节点 config 在 profile 的 `cordis.patch.yml` 里按 id 覆盖：

```yaml
- id: ds-connector
  config:
    port: 28470
    consolePort: 28471
    offerTtlMs: 300000
    enabled: true
```

环境变量（DSC_ 前缀）：`DSC_ENABLED` / `DSC_PORT` / `DSC_CONSOLE_PORT` / `DSC_OFFER_TTL_MS` / `DSC_HOST_NAME` / `DSC_DATA_DIR` / `DSC_LOG_LEVEL`。

## 卸载

UI 卸载（内置插件页）与手动步骤等效，但语义上有三点要知道：

- **UI 卸载不实时卸载渲染进程入口**：依赖、bundles 登记、patch 禁用当场完成，
  但 tab 要**重启 harness 后才消失**（web entry 不做运行中卸载）。
- 卸载后 profile 的 `cordis.patch.yml` 会留下 `- id: ds-connector` + `disabled: true`。
  `pnpm push` 检测到它会拒绝执行（避免把已卸载的入口悄悄装回去）；确认要装回时在
  UI 里重新启用，或设 `DSC_PUSH_FORCE=1`。
- UI 卸载对 `link:` 安装不清 `node_modules/@ds-connector` 符号链接（残留无害但建议清掉）。

手动卸载（最彻底）：

```bash
cd ~/.dsh/profiles/desktop
pnpm remove "@ds-connector/connector"
# 手动从 package.json 的 dsh.profile.bundles 删除 "@ds-connector/connector"
# 可选: rm -rf .ds-connector     # 数据目录（设备册、密钥）
# 可选: mv pnpm-lock.yaml.bak-ds-connector pnpm-lock.yaml
# 可选: rm -rf node_modules/@ds-connector   # link: 安装的符号链接残留
# 重启 DeepSeek Harness
```

## 端口

- 28470/TCP：设备信道（TLS-PSK，绑定 0.0.0.0；首次会触发 Windows 防火墙提示，放行 Node/Electron）
- 28471/TCP：回环控制面（仅绑定 127.0.0.1，本机之外不可达，无鉴权——切勿改动绑定地址）
