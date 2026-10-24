# 直连信道协议 v1（direct channel）

本文定义 DS Connector 的局域网直连信道：桌面端插件与手机之间建立安全信道并完成设备入网的完整线协议。

## 总览

- 传输：TLS 1.2 + PSK（`TLS_PSK_WITH_AES_256_GCM_SHA384`），**无证书**。整个端口不存在未认证面——任何字节都必须先完成 PSK 握手。
- 信令：单一 HTTP 路径 `POST /rpc/<identity>`，请求体为 JSON 信封；健康检查 `GET /rpc/<identity>/health`。
- 身份：`identity` = 邀约 id（入网阶段）或设备 id（重连阶段），同时出现在 URL 与 TLS PSK 身份提示中。

## 邀约（offer）

桌面侧（v1 为回环控制面，未来为 harness UI）生成一次性邀约：

- `offerId`：`off_` + 12 字节随机（base64url）
- `code`：8 位无歧义字符码（Crockford 变体，不含 0/O/1/I/L）
- 有效期：默认 5 分钟；新邀约开启会立即关闭旧邀约

邀约 URI（QR 内容）：

```
dsconnect://l?v=1&h=<host>&p=<port>&o=<offerId>&fp=<hostFp>&c=<code>
```

每个可达地址生成一条 URI；`fp` 为主机 Ed25519 公钥指纹（`ed25519:<base64url(sha256(raw))>`），手机侧用它识别主机并参与 PSK 派生。

## PSK 派生（HKDF-SHA256，32 字节）

| 阶段 | IKM | salt | info |
|---|---|---|---|
| 入网 | `code` | `offerId` | `ds-connector offer-channel v1 <hostFp>` |
| 重连 | `token` | `deviceId` | `ds-connector device-channel v1 <hostFp>` |

安全性质：

- `code` 只出现在邀约 URI（屏幕/QR → 相机），**从不过网络**；无码者在 TLS 握手即被拒绝（unknown_psk_identity 或 bad_record_mac）。
- 错误码派生的错误 PSK 使 Finished 校验失败（bad_record_mac）；错误 identity 直接 unknown_psk_identity。
- QR 被旁观等价于全部泄露——与一切 QR 方案相同，属带外信道固有边界。
- 设备 `token` 为 256 位随机数，仅在入网确认后经受码保护的信道下发一次。

## RPC 信封

请求：`{"v":1,"id":<string|number>,"method":"<name>","params":{...}}`
响应：`{"v":1,"id":...,"result":...}` 或 `{"v":1,"id":...,"error":{"code","message"}}`

错误码：`bad-envelope` / `bad-version` / `unknown-method` / `bad-params` / `offer-closed` / `unknown-offer` / `unknown-device` / `device-suspended` / `internal`

## 方法

| 方法 | 通道身份 | 参数 | 结果 |
|---|---|---|---|
| `enroll.claim` | offerId | `{offerId, deviceName, keyFp?}` | `{status:"wait-confirm", hostFp}` |
| `enroll.poll` | offerId | `{offerId}` | `{status:"wait-confirm"}` \| `{status:"enrolled", deviceId, token}` \| `{status:"expired"}` |
| `device.ping` | deviceId | `{}` | `{ok:true, serverTime}` |
| `device.suspend` | deviceId | `{}` | `{deviceId, state:"suspended"}` |

`params.offerId` 必须与通道 identity 一致（双重绑定，防串扰）。

## 状态机

- 邀约：`open → claimed → enrolled`；终态 `closed`（被新邀约顶替）/ `expired`（超时惰性转移）
- 设备：`awaiting`（已 claim 待桌面确认）→ `enrolled` → `suspended`
- `enroll.claim` 仅在 `open` 受理；`enroll.poll` 在 `claimed/enrolled` 均可；确认后邀约通道保留至过期，供轮询结果

## 入网时序

```
手机                          桌面
 │ ← QR(dsconnect://…) ────────│ 开启邀约（回环控制面触发）
 │ TLS-PSK(offerId, KDF(code))►│ 握手（码正确才可建立）
 │ enroll.claim ──────────────►│ 设备置 awaiting
 │◄─ wait-confirm ─────────────│
 │                             │ 桌面用户确认（控制面 /confirm）
 │ enroll.poll ───────────────►│
 │◄─ enrolled {deviceId,token}─│ 设备置 enrolled，vault 落盘
 │ 重连：TLS-PSK(deviceId, KDF(token))
 │ device.ping / device.suspend│
```

## 落盘

数据目录 `<profile 根>/.ds-connector/vault-v1/`：

- `host-key.json`：主机 Ed25519 密钥对与指纹（落盘加密为后续加固位）
- `vault.json`：`{schemaVersion, hostFp, devices[]}`；主机指纹不匹配时自动重置
- `diagnostics.json`：生命周期事件环形缓冲（不含任何密钥材料）
