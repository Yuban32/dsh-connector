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

# 4. 编辑 ~/.dsh/profiles/desktop/package.json，把 "@dsh-connector/connector"
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
Remove-Item -Recurse -Force "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\@dsh-connector"
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

UI 卸载（内置插件页）与手动步骤等效，语义上有几点要知道：

- **正常路径是热移除**：卸载 = 改 package.json（依赖 + bundles）→ `pnpm remove` →
  HMR 热重组 → 渲染进程经 SSE 收到新启动图并即时卸载对应 UI，无需重启。若当次会话
  SSE 图同步未生效（流断开 / release 不匹配），tab 会残留到**下次重启**才消失。
- 行级禁用开关（非卸载动作）会往 profile 的 `cordis.patch.yml` 写 `- id: ds-connector`
  + `disabled: true`；插件行不存在时该 override 惰性无害。`pnpm push` 检测到它会拒绝
  执行（避免往禁用状态上静默重装）；确认要装回时在 UI 重新启用（或删掉该条），或设
  `DSC_PUSH_FORCE=1`。
- node_modules 残留（`link:` 安装的 symlink、空 scope 目录）是宿主容忍的缓存垃圾：
  启动组合只认 package.json 的 `dsh.profile.bundles`，绝不因目录存在而激活入口；
  建议清掉保持整洁。

手动卸载（最彻底）：

```bash
cd ~/.dsh/profiles/desktop
pnpm remove "@dsh-connector/connector"
# 手动从 package.json 的 dsh.profile.bundles 删除 "@dsh-connector/connector"
# 可选: rm -rf .ds-connector     # 数据目录（设备册、密钥）
# 可选: mv pnpm-lock.yaml.bak-ds-connector pnpm-lock.yaml
# 可选: rm -rf node_modules/@dsh-connector   # link: 安装的符号链接残留
# 重启 DeepSeek Harness
```

## 端口

- 28470/TCP：设备信道（TLS-PSK，绑定 0.0.0.0；首次会触发 Windows 防火墙提示，放行 Node/Electron）
- 28471/TCP：回环控制面（仅绑定 127.0.0.1，本机之外不可达，无鉴权——切勿改动绑定地址）
