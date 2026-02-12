---
Title: PLATFORM_OPTIMIZATION_PLAN - initiative_10_auth_box
Scope: project
Owner: ai-agent
Status: active
LastUpdated: 2026-01-29
Related:
  - /doc/index.md
  - /doc/00_project/index.md
  - /doc/00_project/initiative_10_auth_box/index.md
  - /doc/00_project/initiative_10_auth_box/PRD.md
  - /doc/00_project/initiative_10_auth_box/SYSTEM_ARCHITECTURE.md
  - /doc/00_project/initiative_10_auth_box/USER_EXPERIENCE_MAP.md
---

# 平台优化计划

## 目标
- 稳定性优先：授权与审计链路不可中断。
- 安全性优先：密钥加密与最小权限。
- 交付效率：SOP 一键交付与证据留存。

## 技术栈约束与优化落点
- PostgreSQL：索引与分区策略优先保证审计查询可用性。
- Redis：控制高频读取缓存与异步任务调度。
- OpenTelemetry：统一追踪链路，避免盲区。
- 对象存储：审计导出与归档分层存储，控制成本。
- Docker Compose：本地最小链路可启动，缩短验证回路。
 - 数据保留：审计与导出按策略分层保留，控制存储与合规成本。

## 重点优化方向
1. 安全与合规：密钥轮换策略、审计防篡改。
2. 可靠性：关键流程幂等与失败重试策略。
3. 可观测性：审计日志与调用链追踪。
4. 成本控制：外部平台调用与存储成本优化。
5. 体验：配置与接入流程降低认知负担。

## 成功指标
- 授权创建成功率 >= 99%
- 审计日志可追溯率 = 100%
- 关键流程平均响应 < 500ms（初期）

## 连接器开发规范（来自调研 ai_master_control_prd.html）

| 规范 | 说明 | 验收标准 |
|------|------|----------|
| 声明式能力矩阵 | 每个连接器提供 machine-readable 的 capabilities | JSON schema 可解析 |
| 最小 Scope | 只申请必须的 scopes | 无多余权限 |
| 增量同步 | 必须支持 cursor/watermark | 避免全量拉取 |
| 幂等与补偿 | 写/删动作必须幂等；提供补偿动作 | 可回滚 |
| 速率限制 | 按平台政策做自适应限流 | 无封禁 |
| 输出规范 | 统一为内部 Canonical Schema | 通过 schema 校验 |

## 安全基线（来自调研 ai_master_control_prd.html）

| 安全项 | 说明 | MVP 状态 |
|--------|------|----------|
| 端到端加密 | Vault 数据在端侧加密，云端只存密文 | MVP-1 |
| 强身份验证 | 优先 Passkeys/WebAuthn | MVP-1 |
| Token 安全 | 支持 DPoP/绑定型令牌 | MVP-2 |
| 最小权限连接器 | 每个连接器声明能力矩阵 | MVP-0 |
| 隔离与最小爆炸半径 | 每个租户独立密钥域 | MVP-1 |

## 审计事件溯源（Event Sourcing）

```
AuditEvent {
  event_id, timestamp, actor (user/agent/service), action,
  resource_ref (asset/grant/policy), decision (allow/deny/step_up),
  inputs_hash, outputs_hash, reason, signature, prev_event_hash
}
```

- 用哈希链把事件串起来，避免"日志被改了你还不知道"
- 每个事件包含 prev_event_hash，形成不可篡改链
- 支持导出与验证
