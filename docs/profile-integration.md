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

## 验证（插件自举证，不依赖 harness 日志）

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

```bash
cd ~/.dsh/profiles/desktop
pnpm remove "@ds-connector/connector"
# 手动从 package.json 的 dsh.profile.bundles 删除 "@ds-connector/connector"
# 可选: rm -rf .ds-connector
# 可选: mv pnpm-lock.yaml.bak-ds-connector pnpm-lock.yaml
# 重启 DeepSeek Harness
```

## 端口

- 28470/TCP：设备信道（TLS-PSK，绑定 0.0.0.0；首次会触发 Windows 防火墙提示，放行 Node/Electron）
- 28471/TCP：回环控制面（仅绑定 127.0.0.1，本机之外不可达，无鉴权——切勿改动绑定地址）
