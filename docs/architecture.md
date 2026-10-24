# 实现原理与架构 —— 以及为什么它能远程操控 harness 桌面端

本文回答两个问题：**这套东西的实现原理和设计思路是什么**；**一个"插件"凭什么可以让手机远程操控桌面上的 AI agent**。

## 一句话原理

DS Connector 是一个跑在 harness 桌面端**进程内**的 Cordis 插件：它先用自己的安全信道（TLS-PSK）把"手机"变成一个已认证的设备，然后把自己进程内本来就拥有的宿主能力，经这条信道以 RPC 的形式延伸给手机——**远程操控的本质是"进程内权限 + 认证信道的转发"**。

## 整体分层

```
┌─ 手机端（未来 HarmonyOS app / 现在的 smoke 脚本）
│    扫码取邀约 → TLS-PSK 握手 → RPC 调用
│
├─ 信道层  src/channel/        ChannelAdapter 抽象
│    direct(TLS-PSK over LAN)  relayed(草案)
│    单端点 RPC 信封 /rpc/<identity>
│
├─ 业务层  src/enroll/  src/devices/
│    入网状态机 / 邀约码 / PSK 派生 / 设备注册表
│
├─ 宿主集成层  src/index.ts    Cordis 契约（name + apply）
│    进程内访问宿主服务 ←—— 远程操控的物理基础
│
└─ 宿主  DeepSeek Harness 桌面端（Electron，Cordis 容器）
```

## 1. 宿主集成：插件为什么"生于"harness 进程内

harness 的核心是一个 **Cordis 容器**：harness 自身的能力（会话管理、终端、工作区、网关……）都被拆成一个个 Cordis 插件包，注册进同一个容器树。第三方插件（我们）与这些能力**平级**：

1. profile 的 `package.json` 把我们的包加进 `dsh.profile.bundles`；
2. 宿主启动时加载 bundle 入口，调用 `apply(ctx, config)`；
3. 从这一刻起，我们的代码运行在**宿主的 Node 运行时里**，与宿主核心共享同一个容器——`ctx` 上能拿到的东西，宿主内部组件之间也是这么互相拿的。

这就是第 4 节"远程操控"的物理基础：**不需要打开什么管理端口去"侵入"桌面应用，插件本身就是桌面应用的一部分**。app.asar 里 `dsh-api-*-controller` 系列包（会话、终端、工作区、远程访问等控制器）就是容器内已注册的服务群——它们是插件可以按 Cordis 服务注入约定访问的同层组件（具体服务键名在实现操控面时按需探测，见 4.4）。

## 2. 信道安全：TLS-PSK 的设计推导

### 设计目标

局域网直连，但**端口上不能有任何未认证的面**；不引入证书管理；配对码不出现在网络上；实现零第三方依赖。

### 候选方案对比

| 方案 | 问题 |
|---|---|
| 明文 HTTP + 应用层校验 | 码要过网（哪怕只过一次）；扫描器可随意触碰端点 |
| 自签证书 TLS | Node 无法原生生成证书，要么引入证书库要么依赖 openssl；客户端还得做指纹固定 |
| 应用层挑战-签名握手 | 自己发明密码协议，出错代价高；端点仍暴露可探测 |

### 选定：TLS-PSK，把"码"直接变成密钥

TLS 预共享密钥模式天然免证书，且 **握手即认证**——PSK 错误，连接根本建立不起来。于是思路变成：

> 邀约码不再是一个"待校验的口令"，而是直接参与 **HKDF 派生** 出 TLS 层的 PSK。码从屏幕/QR（带外）到手机相机，**一个字节都不经过网络**。

`src/enroll/psk.ts` 的核心就两行（带外码 → 线上密钥）：

```ts
// 入网阶段：IKM=码, salt=邀约id, info=协议标签+主机指纹
deriveOfferPsk(code, offerId, hostFp)
// 重连阶段：IKM=设备令牌, salt=设备id
deriveDevicePsk(token, deviceId, hostFp)
```

由此得到三个性质：

1. **无码者连 TLS 握手都完不成**（identity 未知 → `unknown_psk_identity`；码错 → Finished 校验失败 → `bad_record_mac`）——端口扫描器只能看到一个"握手必失败"的端口；
2. **主机指纹参与派生**：即使同一码，不同主机派生出不同密钥，防跨主机混用；
3. **身份即地址**：TLS identity（邀约 id / 设备 id）同时出现在 URL 路径里，RPC 层做双重绑定校验。

### 代价（诚实记录）

PSK 模式没有前向保密的证书体系语义；QR 被旁观等价于全部泄露——这是一切 QR 方案的共同边界，依赖"物理在场"假设。缓解是码短命（5 分钟、单活、两阶段确认）。

## 3. 入网流程：从扫码到设备凭证

```
桌面控制面 POST /offer          （生成 offerId + 8位码 + 多地址邀约 URI）
   │
手机 ◄── dsconnect:// URI ────  QR / 控制台打印（带外：码在这里）
   │
手机 ── TLS-PSK(identity=offerId, KDF(code)) ──► 桌面   ← 握手即验码
   │      enroll.claim {deviceName}
   │                                                设备置 awaiting
桌面用户 ── POST /confirm ──►  （两阶段：人在回路的桌面确认）  设备置 enrolled
   │
手机      enroll.poll ─────────────────────────────►  领取 {deviceId, token}
   │
（此后）手机 ── TLS-PSK(identity=deviceId, KDF(token)) ──► device.ping / device.suspend
```

设计要点：

- **两阶段确认**是第二道门：即使码泄露给旁观者，设备停留在 `awaiting`，仍需桌面用户点确认——**人参与信任建立**；
- **凭证分级**：一次性短命码（人可抄写）→ 256 位随机长期令牌（机器保管）；令牌只在受码保护的信道里下发一次；
- **吊销即删钥**：`suspended` 后服务端 `pskForIdentity` 返回空，设备连握手都过不了——吊销不是"记账"，是"拔钥匙"。

## 4. 远程操控的桥接原理（关键问题）

### 4.1 为什么"可以"

回到第 1 节：插件运行在宿主进程内的 Cordis 容器里。**harness 桌面端能做的事（创建会话、驱动 agent、读终端、改工作区文件），插件在进程内同样能做**——这不是特权提升，而是插件本来就是宿主的一部分。

所以"手机远程操控 harness"不需要任何魔法：

```
手机 ──(TLS-PSK 信道, 已认证)──► 插件 RPC 路由 ──(进程内调用)──► 宿主服务 ──回程──► 手机
```

插件的角色是一个**进程内桥**：把信道上的 RPC 方法翻译成对宿主服务的调用。安全边界已经由入网体系收窄到"已入册设备"，桥本身只做转发。

### 4.2 桥的两侧各自解耦

- **信道侧**：手机只认识一套稳定的 RPC 方法面（`enroll.*` / `device.*` / 未来的 `session.*`），不知道宿主内部结构；
- **宿主侧**：方法处理器通过 Cordis 的服务注入访问宿主，不认识 TLS 和手机。
  任何一侧变化都不渗透到另一侧——这也是为什么直连和中继两种信道能共用同一套方法面。

### 4.3 参照物

已安装的同类商业插件验证了这条路径的工程可行性（它的模块群正是"入网 + 会话消息队列 + 会话读取"的桥接层）。本项目按 clean-room 原则独立设计了协议与代码（见 docs/clean-room-notes.md），不复制其表达。

### 4.4 v1 现状与下一步（诚实边界）

v1 已交付：**信道 + 入网 + 设备管理**完整可用（`device.ping` 证明端到端信道）。**操控面尚未接线**：`session.*` 方法还没有映射到宿主服务。下一步工作明确且可枚举：

1. 在 harness 运行时里枚举 Cordis 容器已注册的服务键（会话控制器、工作区控制器等）；
2. 设计 `session.list / session.send / session.output` 等方法面，做"方法 → 宿主服务调用"的薄映射；
3. 按最小权限原则逐个放行方法，每个方法都有明确的授权检查。

之所以现在不写，是因为服务键名属于宿主内部约定，需要连着真实 harness 探测确认，避免猜接口。

## 5. 安全模型与边界（v1）

| 项 | 现状 |
|---|---|
| 信道机密性/完整性 | TLS 1.2 PSK-AES256-GCM-SHA384 |
| 端点暴露面 | 零未认证面（一切先握手）；控制面仅绑 127.0.0.1 |
| 入网信任 | 码（带外）+ 桌面人工确认 + 设备密钥派生 |
| 吊销 | suspend 即握手期拒绝；vault 落盘持久 |
| 落盘 | 主机私钥与设备令牌目前明文存于用户数据目录——**已知待办**，加密落盘的接口位已预留 |
| 速率 | 局域网可达性天然限速；中继方案必须补爆破限速（见 relayed-channel.md 待定点） |

## 6. 源码导读

| 文件 | 职责 |
|---|---|
| `src/index.ts` | 宿主入口（name + apply）、运行时组装、RPC 方法面 |
| `src/enroll/psk.ts` | **本文第 2 节的核心**：码/令牌 → TLS PSK 的 HKDF 派生 |
| `src/enroll/gate.ts` | 入网状态机（邀约 + 设备生命周期、identity→PSK 查找） |
| `src/enroll/codes.ts` | 无歧字符码生成与规范化 |
| `src/devices/vault.ts` | 设备注册表（单文件原子持久化、按主机指纹绑定） |
| `src/host/host-keys.ts` | 主机 Ed25519 密钥对与指纹 |
| `src/channel/rpc.ts` | RPC 信封编解码与分发 |
| `src/channel/direct/lan.ts` | TLS-PSK 服务器（握手先行，HTTP 后行） |
| `src/channel/direct/psk-http-client.ts` | 手机侧最小 HTTP 助手（smoke/测试用） |
| `src/channel/relayed/stub.ts` | 中继桩（接口留位） |
| `src/console/console.ts` | 回环管理面（v1 的 UI 替身） |
| `tests/naming.test.mjs` | clean-room 命名守卫 |
