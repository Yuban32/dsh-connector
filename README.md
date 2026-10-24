# DS Connector

运行于 DeepSeek Harness 桌面端的手机入网插件：桌面出示一次性邀约，手机扫码建立安全信道并完成设备注册，之后凭长期凭证重连。

第一期交付**可运行骨架 + 信道抽象**：局域网直连完整可用；中继方案仅保留接口与草案（见下）。

## 特性

- **TLS-PSK 直连信道**：配对码经 HKDF 派生为 TLS 预共享密钥，码永不过网；信道无证书，整个端口无未认证面
- **两阶段入网**：手机 claim → 桌面确认 → 手机 poll 领取设备凭证；邀约 8 位无歧义码、默认 5 分钟有效、单活
- **设备注册表**：单 vault 文件持久化，多设备管理（enrolled / suspended）
- **回环控制面**：`127.0.0.1:28471` 提供状态/邀约/确认/停用（v1 的 UI 替身）
- **运行时零依赖**：纯 Node 标准库（node:crypto / node:tls / node:http）
- **自举证**：apply 落数据目录 + 回环 `/state`，不依赖宿主日志即可确认加载

## 快速开始

```bash
pnpm install
pnpm build
pnpm test          # 27 个用例，含真实 TLS-PSK 端到端与 clean-room 命名守卫
pnpm smoke         # 对运行中的插件（harness 内或独立）跑完整入网闭环
```

接入真实 harness profile、验证与卸载：**docs/profile-integration.md**。

## 协议与文档

- 实现原理与架构（含"为什么能远程操控"）：docs/architecture.md
- 直连信道线协议 v1：docs/direct-channel-v1.md
- 中继接口草案（未实现）：docs/relayed-channel.md
- profile 接入与卸载：docs/profile-integration.md
- clean-room 合规说明：docs/clean-room-notes.md

## 结构

```
src/
├── index.ts          # Cordis 入口（name + apply）与运行时组装
├── host/             # 主机 Ed25519 密钥与指纹
├── devices/          # 设备注册表（vault）
├── enroll/           # 邀约码 / PSK 派生 / 入网状态机
├── channel/
│   ├── rpc.ts        # 单端点 RPC 信封
│   ├── direct/       # TLS-PSK 局域网信道 + 手机侧 HTTP 助手
│   └── relayed/      # 中继桩（接口留位）
├── console/          # 回环管理面
└── diagnostics.ts    # 事件环形缓冲（不含密钥）
client/               # harness web 客户端占位模块
scripts/              # client 打包 / 入网冒烟脚本
tests/                # 单测 + 端到端 + 命名守卫
```

## 配置

Cordis 节点 config > `DSC_*` 环境变量 > 默认值。默认端口 28470（设备信道）/ 28471（回环控制面）。

## 安全边界（v1）

- 主机私钥明文落盘于用户数据目录（加密落盘是后续加固位，接口已预留）
- QR 被旁观等价于全部泄露（一切 QR 方案的共同边界）
- 回环控制面无鉴权（仅绑 127.0.0.1）
- Windows 防火墙首次放行提示需人工确认
