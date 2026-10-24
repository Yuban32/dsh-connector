# DS Connector · HarmonyOS 手机端 — 基础架构设计 v1

> 分支：`harmonyos-connector-app` ｜ 目标平台：HarmonyOS 5.0+ / API 12 ｜ 产品名：DS Connector ｜ bundle 占位：`com.dsconnector.phone`

> **✳️ 状态更新（2026-11-16）：实现路线已切换为 React Native on HarmonyOS**
>
> 实际工程落在 [`src/`](../src/)（RN 0.84 + RNOH 0.84.3，已跑通模拟器 + Tab 导航骨架；环境启动见
> [src/开发环境启动教程.md](../src/开发环境启动教程.md)）。本文定位随之调整为：
>
> - **§2 协议契约、§6 关键流程：仍然有效**，是 RN 侧与桌面插件互操作的权威依据；
> - **§3–§5、§7–§11 的 ArkTS 原生工程结构（core HAR / platform 端口 / ArkUI 页面 / M0 spike）：历史方案**，保留作设计参考，不再按其执行；
> - 概念映射：`core`（纯 TS 协议核心，禁平台 import、node 可单测）→ 将来的 RN 侧 TS 模块；`port` 注入 → TS 接口 + 平台适配模块；ArkUI `pages` → `src/src/screens/*Screen.tsx`；`AppStore`(@ObservedV2) → 跨组件状态库（选型见 [移动开发规范.md §4.3](../src/移动开发规范.md)）。
>
> bundle 名以实际工程为准：`com.dsconnector.myapplication`（上文 `com.dsconnector.phone` 为占位草案）。

## 1. 范围与总体决策

- **一期**：扫码/粘贴入网闭环（claim → 桌面确认 → poll 领取凭证 → 首次 ping）+ 已配对设备管理（列表/详情/测活/自停用/删除/重命名/改地址/冷启动恢复）
- **二期占位**：远程控制、会话列表、中继信道——只留接口、路由与目录，不实现
- **四条硬性架构规则**：
  1. 协议核心层**纯 TS、零 `@ohos` import**，平台能力全部经端口接口注入 → 本地 node 可单测
  2. 传输层抽象隔离 PSK 不确定性：`TlsMode` 参数化，`OhosTlsTransport` 是唯一接触 TLSSocket 的文件
  3. 全部网络交互为**短连接**：一次请求 = 一条新 TLS 连接 + `connection: close` + 读到 EOF（对齐桌面端与替身脚本），无长连接、无后台保活诉求
  4. clean-room 禁词守卫从第一天起随测试运行

## 2. 协议契约（与桌面插件互操作，逐字一致）

**邀约 URI（即 QR 内容）**

```
dsconnect://l?v=1&h=<host>&p=<port>&o=<offerId>&fp=<hostFp>&c=<code>&t=<mode>
```

- `t` ∈ `psk | psk-broad | cert`（缺省 psk）；`c` 为 8 位无歧义码（字母表 `23456789ABCDEFGHJKMNPQRSTUVWXYZ`）
- `fp` = `ed25519:` + base64url(sha256(裸 32 字节公钥))；邀约 5 分钟有效、单活（新顶替旧）；桌面确认是人在回路

**TLS 三模式**（桌面端阶梯竞争 psk → psk-broad → cert，胜者写入 `t=`）

| 模式 | 要点 |
|---|---|
| psk | TLS 1.2 only、`PSK-AES256-GCM-SHA384`、无证书；码错 = 握手失败（`unknown_psk_identity`/`bad_record_mac`），要和网络不可达区分提示 |
| psk-broad | 同上 + `PSK-AES128-GCM-SHA256` |
| cert | 自签 EC 证书（10 年），TLS ≥1.2；持码证明在应用层（claim 必带 `code`）；**v1 手机端无法校验服务器**（fp 无校验点），UI 固定风险文案 |

**HKDF-SHA256 PSK 派生（L=32 字节）**

| 通道 | ikm(UTF-8) | salt | info |
|---|---|---|---|
| 入网 | `code` | `offerId` | `"ds-connector offer-channel v1 " + hostFp` |
| 设备重连 | `token` | `deviceId` | `"ds-connector device-channel v1 " + hostFp` |

**RPC**（单端点，认证即 TLS 本身，无 HTTP 认证头）

- `POST /rpc/<identity>`：请求 `{"v":1,"id":<num|str>,"method":"...","params":{}}`；响应 `{"v":1,"id":...,"result":...}` 或 `{"v":1,"id":...,"error":{"code","message"}}`
- **HTTP 200 也可能带 error 信封**（以信封为准）；400=信封解析失败（id 固定 -1）；请求体上限 64KiB、响应容忍 1MiB
- 传输：每请求一条新 TLS 连接、`content-type: application/json`、`connection: close`、读到 EOF、`\r\n\r\n` 分帧；节奏 poll 2s / ping 15s / 请求超时 8s
- `GET /rpc/<identity>/health` → `{"ok":true,"wire":1}`

**方法面（v1 全集，identity=offerId 或 deviceId）**

| method | params | result / 错误 |
|---|---|---|
| `enroll.claim` | `{offerId, deviceName, keyFp?, code?}` | `{status:"wait-confirm", hostFp}`；offerId 必须 === identity；cert 模式必带 code |
| `enroll.poll` | `{offerId}` | `wait-confirm` \| `{status:"enrolled", deviceId, token}` \| `{status:"expired"}`（确认后邀约通道保留至过期，勿提前放弃） |
| `device.ping` | `{}` | `{ok:true, serverTime}`；未知→`unknown-device`，停用→`device-suspended` |
| `device.suspend` | `{}` | `{deviceId, state:"suspended"}`（可自停用） |

错误码全集：`bad-envelope` `bad-version` `unknown-method` `bad-params` `offer-closed` `unknown-offer` `unknown-device` `device-suspended` `internal`

**设备身份与凭据**

- 手机端生成 Ed25519 密钥对，`keyFp = ed25519:+base64url(sha256(裸公钥))`（SPKI DER 去前 12 字节），claim 可选上报（v1 服务端只存不验，可缓发）
- 入网成功得 `{deviceId, token}`（token=32B 随机 base64url，重连 PSK 的 HKDF ikm）——**敏感，需持久化**
- claim 响应 `hostFp` 必须与 QR 的 `fp` 比对（不一致=风险中止）

## 3. 工程结构与分层

```
├── AppScope/app.json5                      # bundleName: com.dsconnector.phone
├── build-profile.json5                     # modules: ["entry", "core"]
├── core\                                   # ★ 本地 HAR：协议核心，纯 TS，禁 @ohos
│   ├── oh-package.json5                    # name "dsc_core"，零依赖声明
│   ├── Index.ts                            # 唯一导出口
│   └── src\main\ets\
│       ├── protocol\                       # offerUri / kdf / envelope / methods / fingerprint
│       ├── enroll\pairingMachine.ts        # 入网状态机
│       ├── channel\                        # rpcClient / direct(端点工厂) / relayed(占位 stub)
│       └── port\                           # 平台端口接口：tlsTransport / crypto / random /
│                                           #   clock / keyStore / deviceVault
├── entry\src\main\
│   ├── module.json5                        # 权限：INTERNET；页面注册
│   └── ets\
│       ├── entryability\EntryAbility.ets
│       ├── platform\                       # 端口的 @ohos 实现
│       │   ├── OhosTlsTransport.ets        # ★ 唯一接触 TLSSocket（spike 结论落点）
│       │   ├── OhosCrypto / OhosKeyStore / OhosRandomTs / OhosClock .ets
│       │   ├── AssetVault.ets              # 设备凭证持久化（AssetStoreKit/preferences）
│       │   └── QrScanner.ets               # @kit.ScanKit 封装
│       ├── service\                        # PairingService / DeviceVaultService / DeviceSessionService
│       ├── model\AppStore.ets              # @ObservedV2 全局状态单例
│       └── pages\  components\  util\
├── tests\                                  # node:test 纯逻辑单测（hvigor 不编译）
├── scripts\                                # core-tests.mjs / naming-guard.mjs（禁词守卫）
└── docs\                                   # architecture.md / spike-psk-result.md
```

**依赖方向（单向无环）**：

```
UI(.ets) ──▶ service(.ets) ──▶ core(.ts 纯逻辑)          core ──▶ 只依赖自己的 port 接口
   │                        │
   └──▶ model(.ets)         └──▶ platform(.ets) ──implements──▶ core/port 接口
```

机械强制：core 零依赖声明 + 守卫脚本断言 `core/src` 无 `@ohos.` / `@kit.` import。

**两栖类型纪律**（core 同时被 hvigor 与 `node --experimental-strip-types` 消费）：core 内一律 `.ts`；禁 enum / 构造器参数属性 / 命名空间 / 装饰器；`import type`；union 类型只活在 core 的 `.ts` 内部，`.ets` 侧只用字符串比较。

## 4. 分层架构图

```
┌────────────── UI 层（ArkUI 声明式，.ets）──────────────┐
│ pages: Index · PairingEntry · PairingScan ·           │
│        PairingProgress · DeviceDetail                 │
│        二期占位: SessionList · RemoteControl           │
│ components / model/AppStore(@ObservedV2)              │
└──────▲────────────────────────────────────────────────┘
       │ async 服务方法 / @Trace 订阅
┌──────┴──────── 服务层（.ets，可接触 @ohos）────────────┐
│ PairingService       解析→cert风险确认→状态机→路由     │
│ DeviceVaultService   设备列表/删除/重命名              │
│ DeviceSessionService ping测活/自停用/前台心跳节奏      │
└──────▲────────────────▲───────────────────────────────┘
       │ import dsc_core │ 组装端口实现并注入
┌──────┴──────── 平台适配层（entry/platform）────────────┐
│ OhosTlsTransport · OhosCrypto · OhosKeyStore ·        │
│ AssetVault · QrScanner  —— 实现 core/port 全部接口     │
└──────▲────────────────────────────────────────────────┘
       │ implements（依赖倒置）
┌──────┴──── 协议核心层 core/（纯 TS，node 可单测）───────┐
│ protocol: offerUri kdf envelope methods fingerprint   │
│ enroll:   pairingMachine                              │
│ channel:  rpcClient direct relayed(占位)              │
│ port:     TlsTransport CryptoPort KeyStore DeviceVault│
└────────────────────────────────────────────────────────┘
```

中继占位对齐桌面 `src/channel/relayed/stub.ts`：接口 + 恒抛 `ProtocolError('relay','not-implemented')`，UI/服务层不出现中继分支。

## 5. 核心接口签名

```ts
// port/tlsTransport.ts —— PSK 不确定性的隔离边界
export type TlsMode = 'psk' | 'psk-broad' | 'cert';
export interface TlsConnectOptions {
  host: string; port: number;              // 默认 28470
  identity: string;                        // offerId（入网）或 deviceId（重连）
  mode: TlsMode; psk?: Uint8Array;         // cert 模式缺省 psk
  connectTimeoutMs: number;                // 默认 8000
}
export interface TlsStream {
  write(data: Uint8Array): Promise<void>;
  readAll(timeoutMs: number): Promise<Uint8Array>;   // 读到对端 EOF
  close(): void;
}
export interface TlsTransport { connect(opts: TlsConnectOptions): Promise<TlsStream>; }
// 握手失败统一抛 ProtocolError{phase:'handshake'|'transport'}，保留原始 alert/errno

// port/crypto.ts · keyStore.ts · deviceVault.ts
export interface CryptoPort { hmacSha256(key, data): Uint8Array; sha256(data): Uint8Array; }
export interface KeyStore {
  ensureIdentity(): Promise<DeviceIdentity | null>;  // 失败返回 null（keyFp 可缓发）
  regenerate(): Promise<DeviceIdentity>;
}
export interface DeviceVaultStore {
  load(): Promise<EnrolledDevice[]>; put(d): Promise<void>; remove(id): Promise<void>;
}
// EnrolledDevice: { deviceId, name, host, port, hostFp, token(敏感), keyFp?,
//                   enrolledAt, lastSeenAt?, state }   // state: 'enrolled' | 'suspended'

// protocol/kdf.ts —— HKDF 手写（createKdf 疑似 API 14+，用 HMAC-SHA256 自实现，API 12 可用）
export function hkdfSha256(crypto: CryptoPort, ikm, salt, info, length): Uint8Array;
export function deriveOfferPsk(crypto, code, offerId, hostFp): Uint8Array;
export function deriveDevicePsk(crypto, token, deviceId, hostFp): Uint8Array;

// protocol/envelope.ts
export class ProtocolError extends Error { readonly phase: string; readonly code: string; }
//   phase: 'rpc' | 'handshake' | 'transport' | 'state' | 'relay'
export function encodeRequest(id, method, params?): Uint8Array;
export function decodeResponse(raw): DecodedResponse;                       // 以信封 error 为准
export function splitHttpFrame(raw): { status: number; body: Uint8Array };  // 预留 chunked dechunk

// enroll/pairingMachine.ts
export const PairingPhase = { Idle, OfferParsed, Connecting, Claiming,
                              WaitConfirm, Enrolled, Failed, Expired } as const;
export class PairingMachine {
  constructor(deps: PairingDeps);          // 注入全部端口 + pollIntervalMs / maxPollFailures(默认3)
  onEvent(cb: (e: PairingEvent) => void): void;
  start(uri: string, deviceName: string): Promise<PairingOutcome>;
  cancel(): void;
}
// PairingOutcome.reason：uri-invalid | unreachable | handshake-rejected | offer-closed |
//                        host-fp-mismatch | offer-expired | protocol | cancelled

// channel/rpcClient.ts + direct.ts
export class RpcClient { call(method, params, timeoutMs?): Promise<object>; health(): Promise<object>; }
export function offerEndpoint(crypto, o: ParsedOffer): RpcEndpoint;     // 派生 offerPsk
export function deviceEndpoint(crypto, d: EnrolledDevice): RpcEndpoint; // 派生 devicePsk
export function buildClaimParams(o, deviceName, keyFp?): object;        // cert 模式强制附 code
```

## 6. 关键流程

### 扫码配对（错误分支全列出）

```
扫码/粘贴 → parseOfferUri ─失败→ uri-invalid
→ cert 模式弹风险确认 ─取消→ cancelled
→ ensureIdentity（null 则 claim 缓发 keyFp）
→ claim（派生 offerPsk）：
   握手失败 → handshake-rejected（"入网码无效或邀约已刷新，请重新生成"）
   连接拒绝/超时 → unreachable（"同一 Wi-Fi + 防火墙放行 28470"）
   offer-closed/unknown-offer → offer-closed（"已被顶替或过期，请重新扫码"）
   成功 → hostFp 与 QR fp 比对 ─不一致→ host-fp-mismatch（中止）
→ wait-confirm：poll 每 2s，进度页"请在桌面端点击确认入网"+ 倒计时
   连续传输失败 ≥3 → unreachable；expired → offer-expired
   enrolled → vault.put 凭证 → deviceEndpoint 首次 ping（失败仅告警不回滚）→ 跳设备列表
```

### 重连与设备管理

- 冷启动 `vault.load()` 渲染列表，**不做自动 ping**（避免启动网络风暴）；详情/下拉刷新才测活
- ping 握手失败 = "桌面已不认识此设备（token 失效/被删/vault 重置）"（PSK 模式下 suspended 同样表现为握手失败）；`device-suspended` → 本地置 suspended
- 自停用成功后本地同步置 suspended；删除仅删本地凭证，桌面侧保留（文档明示不对称）
- 心跳：仅前台且页面可见时每 15s ping 可见设备，隐藏即停；无长连接、不申请长时任务

## 7. 页面清单

| 页面 | 阶段 | 要点 |
|---|---|---|
| `Index` 设备列表（首页） | 一期 | Navigation 根；设备卡片（名称/host/状态徽标/lastSeen）；空态引导；下拉刷新测活；滑动删除 |
| `PairingEntry` 配对入口 | 一期 | 扫码按钮 + 粘贴邀约链接输入框（兜底） |
| `PairingScan` 扫码 | 一期 | ScanKit 托管模式（免 CAMERA 权限）；失败引导回粘贴通道 |
| `PairingProgress` 配对进度 | 一期 | 订阅 PairingEvent；cert 风险弹窗；倒计时；错误分支文案 |
| `DeviceDetail` 设备详情 | 一期 | 凭证信息；测活/自停用/删除/重命名/修改地址 |
| `SessionList` / `RemoteControl` | 二期占位 | NavDestination 注册 + "即将推出" |

状态管理：`model/AppStore.ets` @ObservedV2/@Trace（devices / pairingPhase / lastOutcome）。

## 8. 测试与联调

1. **本地单测**：`node scripts/core-tests.mjs`（先禁词守卫，后 `node --test --experimental-strip-types tests/`；Windows 下显式枚举文件）；覆盖 kdf 向量比对（node:crypto `hkdfSync` 为参照）、URI 解析边界、信封编解码 + HTTP 帧回放（FakeTransport）、状态机全分支、RPC 客户端
2. **真机 hypium**（`entry/src/ohosTest`）：spike 断言集、AssetVault 回环、OhosTlsTransport 对本地 node:tls PSK/cert 测试服务器握手往返
3. **桌面真插件联调**：桌面跑 main v0.2.4 插件（`DSC_LOG_LEVEL=debug`，回环 `127.0.0.1:28471` 生成邀约/确认/停用）；**替身对照法**——同一邀约 URI 先喂 `scripts/phone-client.mjs` 作基线，再用 app 走同 URI 逐项比对；协议争议以替身脚本 + main 的 `docs/direct-channel-v1.md` 为准

## 9. 里程碑

| # | 内容 | 验收标准 |
|---|---|---|
| M0 | spike 真机验证：pskOption 存在性、cert 未知 CA 行为、HMAC/SHA256/Ed25519、ScanKit/AssetStoreKit 可用性 | 结论落 `docs/spike-psk-result.md`；psk 或 cert 至少一条路径对 node:tls 演示服务器握手往返成功；bundle 名定稿 |
| M1 | 协议核心纯逻辑 + 单测 + 禁词守卫 | `node scripts/core-tests.mjs` 全绿；kdf 与替身/桌面输出逐字节一致；core 纯净性断言通过 |
| M2 | 传输层 + 直连打通 | 真机粘贴 URI → claim（桌面见 awaiting）→ 桌面确认 → poll enrolled → device.ping ok（可无 UI，日志为证） |
| M3 | 配对 UI 闭环 | 扫码/粘贴 → 进度 → 凭证落盘 → 跳列表，真机 ≤2 分钟；五大错误分支逐一演练有文案 |
| M4 | 设备管理 + 打磨 | 冷启动恢复并 ping 通；测活/停用/删除/重命名与桌面状态一致；二期占位路由可导航；守卫 + 测试全绿 |

## 10. 风险清单

1. **PSK 不确证（首要）**：`pskOption` 疑似 API 15+。已核实桌面侧钩子 `DirectChannelOptions.disabledModes` 存在（main 的 `src/channel/direct/lan.ts:21-22`）但 `DscConfig` 未暴露模式开关——若 PSK 不可用，桌面需小改暴露配置强制 cert 模式（后续依赖，本分支不动桌面）
2. **cert 模式安全限制（同级）**：spike 必须回答"TLSSocket 能否对未知 CA 完成握手"；若 cert/PSK 全不可行 = 阻断性风险，回协议层讨论
3. **Ed25519 可用性**：cryptoFramework 应支持（API 12），HUKS 兜底；最坏 keyFp 缓发（协议无损）
4. **禁词误触**：HarmonyOS 生态文案可能撞 `os[-_ ]?link` 正则；守卫 M0 就位，脚手架生成后立即首跑
5. **ArkTS 子集 × node strip-types 双跑**：类型纪律 + 双端测试兜底
6. **HTTP 帧细节**：逐字对齐替身；遇 chunked 仅在 `splitHttpFrame` 补 dechunk（已预留）

## 11. 命名守卫移植

`scripts/naming-guard.mjs`：从 main 的 `tests/naming.test.mjs` 移植（node:test），改动仅三处——

- 扫描目录 `['core/src', 'entry/src', 'tests', 'scripts', 'docs']`
- 扫描文件加 `*.json5` / `AppScope/app.json5` / `README.md`
- 跳过 `node_modules / oh_modules / build / .hvigor / dist / .git`

FORBIDDEN 表**逐字照抄**（保持运行时拼装防自命中写法，禁词：`dshos`、`os[-_ ]?link` 正则、`pairingId`、`connectionGeneration`、`connectionToken`、`mobilePublicKey`、`cloud-pairing`、`24690`）。追加 core 纯净性断言（`core/src` 出现 `@ohos.` / `@kit.` 即失败）。入口 `scripts/core-tests.mjs` 先跑守卫再跑单测。
