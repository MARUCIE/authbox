---
Title: PRD - initiative_10_auth_box
Scope: project
Owner: ai-agent
Status: active
LastUpdated: 2026-02-24
Related:
  - /doc/index.md
  - /doc/00_project/index.md
  - /doc/00_project/initiative_10_auth_box/index.md
  - /doc/00_project/initiative_10_auth_box/SYSTEM_ARCHITECTURE.md
  - /doc/00_project/initiative_10_auth_box/USER_EXPERIENCE_MAP.md
  - /doc/00_project/initiative_10_auth_box/PLATFORM_OPTIMIZATION_PLAN.md
---

# PRD - Auth Box v2

## 背景与问题

当前密码管理器（1Password、Google Password Manager、Apple Keychain）仅管理密码与基本凭据。在 AI 时代，用户面临三个未被统一解决的痛点：

1. **密码分散**：跨平台密码存储在多个互不兼容的管理器中，无法统一检索与安全审计。
2. **授权碎片化**：OAuth Token、API Key、Service Account 分散在各平台设置中，缺乏生命周期管理与集中吊销能力。
3. **AI 助手无法安全获取凭据**：AI Agent 需要访问用户凭据来执行自动化任务（登录、API 调用、表单填充），但当前没有安全、可审计、策略受控的凭据分发机制。

## 愿景

Auth Box v2 定位为 **零知识加密的数字身份网关**，统一管理三大支柱：

| 支柱 | 能力 | 差异化 |
|------|------|--------|
| **Passwords** | 零知识 E2E 加密密码管理 | 服务端永远无法看到明文 |
| **Authorizations** | OAuth/API Key 生命周期管理 | 自动刷新、集中吊销、过期告警 |
| **AI Gateway** | AI Agent 凭据分发网关 | 浏览器扩展即 MCP Server |

## 杀手级差异化

**浏览器扩展兼具 MCP Server**：Auth Box 的 Chrome 扩展不仅是传统的密码自动填充工具，同时暴露标准 MCP（Model Context Protocol）接口。AI Agent 可以通过 MCP 协议安全地请求凭据、执行认证代理请求，所有操作受策略引擎管控并记录审计日志。

## 核心设计原则

1. **零知识架构**：Master Password 永不离开客户端。服务端仅存储加密后的 Vault Blob，无法解密。
2. **客户端加密**：所有加密/解密在客户端完成（Browser Extension / Desktop App / Web Worker）。
3. **SRP-6a 认证**：使用 Secure Remote Password 协议，服务端无需存储密码哈希。
4. **策略前置**：AI Agent 的每次凭据访问必须通过策略引擎裁决（allow/deny/step_up）。
5. **可审计**：所有操作生成不可篡改的审计事件（hash chain）。

## 目标用户与 Persona

| Persona | 用户类型 | 核心需求 |
|---------|----------|----------|
| P0_DEVELOPER | 个人开发者 | 安全存储密码与 API Key，AI 助手可自动使用凭据 |
| P1_TEAM_LEAD | 团队负责人 | 团队凭据共享、权限分级、操作审计 |
| P2_AI_POWER_USER | AI 深度用户 | 通过 MCP 让多个 Agent 安全访问不同凭据 |
| P3_SECURITY_PRO | 安全敏感用户 | 零知识加密、本地优先、完全掌控自己的数据 |

## 功能需求

### Phase 0: 基础设施（当前阶段）

- Turborepo + pnpm Monorepo 脚手架
- `@authbox/crypto` 包：Argon2id、HKDF、AES-256-GCM、SRP-6a 客户端
- `@authbox/shared` 包：类型定义、常量、工具函数
- Go API 骨架：SRP 认证端点、Vault CRUD、健康检查
- Docker Compose 本地开发环境

### Phase 1: 核心密码管理

- 用户注册与 SRP 登录
- Vault 创建与加密存储
- Vault Item CRUD（密码、笔记、信用卡）
- 密码生成器（可配置长度、字符集）
- 文件夹与标签组织

### Phase 2: 浏览器扩展

- Chrome MV3 扩展
- 登录表单自动检测与自动填充
- 新凭据保存提示
- 扩展内 Vault 浏览与搜索
- 内嵌 MCP Server（`ws://localhost:19876/mcp`）

### Phase 3: AI Agent Gateway

- Agent 注册与 API Key 分发
- 访问策略引擎（scope/rate-limit/time-window/approval）
- MCP 工具集：`get_credential`、`proxy_authenticated_request`、`list_available_services`
- Agent 活动审计与仪表盘

### Phase 4: 平台完整化

- Desktop App（Tauri）
- Mobile App（React Native）
- OAuth 连接管理（自动刷新、状态监控）
- 团队功能（共享 Vault、RBAC）
- 导入/导出（1Password、Chrome、Bitwarden）

## 非目标

- 不替代企业级 IAM 系统（Okta、Auth0）
- 不做通用 API 网关
- 不兼容 v1 数据格式与 API（完全重写）
- 不做联邦学习或模型训练

## 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| Monorepo | Turborepo + pnpm | 统一构建与依赖管理 |
| 后端 API | Go 1.22+ | REST + OpenAPI 3.1 |
| 前端 Web | Next.js 15 + React 19 | SSR + App Router |
| 浏览器扩展 | Chrome MV3 | Service Worker + Popup + Content Script |
| 桌面端 | Tauri (Phase 4) | Rust + WebView |
| 移动端 | React Native (Phase 4) | 跨平台 |
| 加密库 | @authbox/crypto | Argon2id + HKDF + AES-256-GCM + SRP-6a |
| 数据库 | PostgreSQL 16 | 核心数据存储（仅加密 Blob） |
| 缓存 | Redis 7 | Session 与速率限制 |
| MCP 协议 | @authbox/mcp-protocol | WebSocket + JSON-RPC |

## KPI（Phase 1 完成后开始度量）

| 指标 | 目标 | 说明 |
|------|------|------|
| Vault 操作量/天 | >100 (Beta) | 密码创建/读取/更新/删除 |
| Agent Gateway 请求量/天 | >50 (Beta) | AI Agent 通过 MCP 发起的凭据请求 |
| Extension 安装量 | >500 (Public Beta) | Chrome Web Store 安装数 |
| 注册转化率 | >15% | Landing -> 完成注册 |
| 零安全事件 | 0 | 明文泄露、未授权访问事件数 |

## 风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 加密库实现缺陷 | 数据安全 | 使用成熟的 WebCrypto API + 第三方审计 |
| SRP 协议复杂度 | 开发周期 | 参考 1Password/Bitwarden 实现 |
| MCP 协议尚在早期 | 兼容性 | 跟踪 Anthropic MCP 规范更新 |
| 客户端加密性能 | 用户体验 | Web Worker + WASM 加速 |

## 里程碑

| 里程碑 | 内容 | 状态 |
|--------|------|------|
| M0 | Monorepo + Crypto 包 + Go API 骨架 | DONE |
| M1 | Web 端密码管理可用 (Vault CRUD + Generator + Search) | DONE |
| M2 | Chrome 扩展 + 自动填充 | DONE |
| M3 | AI Agent Gateway + MCP | DONE |
| M3.5 | Hardening (2FA + Sessions + Rate Limiting) | DONE |
| M3.6 | UX Optimization Round 1 (12/12 fixes) | DONE |
| M3.7 | UX Optimization Round 2 (7 Journey simulation) | DONE |
| M3.8 | Architecture Audit + Vault Onyx Design System | DONE |
| M3.9 | v3 Unstoppable Layer (Seed Phrase + HD Keys + Deterministic Passwords) | DONE |
| M4.0 | Production Deploy (CF Pages + authbox.io + E2E Test + Security Headers) | DONE |
| M4.1 | Launch Kit (Remotion Video + PH/HN/Twitter Copy + MIT + README) | DONE |
| M5.0 | v5 Permanent Storage (Arweave vault blobs + Bitcoin hash anchoring) | PLANNED |
| M5.1 | Go API VPS Deploy (PG + Redis + Docker, full CRUD online) | PLANNED |
| M5.2 | Five Primitives Engine (Capability/Intent/Policy/Effect/Fact) | PLANNED |
| M6 | Desktop + Mobile + 团队功能 | Post-MVP |

## 当前状态

- Phase 0-4 + Gap Fixes + UX Round 1-2 + Round 3-7 Hardening + M3.8 全部完成
- 构建通过：13/13 Web pages + Console 全部 pages, 0 errors
- 7 条用户旅程 (A-G) 全部 PASS
- 9/9 Web App 路由 HTTP 200
- 20/20 API endpoints tested against real PostgreSQL + Go API (no mock)
- SRP-6a 协议修复 (M1 K=H(S) 对齐) + 6 测试 PASS
- TOTP 2FA 集成到登录流程 (totpRequired + LoginVerifyTOTP)
- Repository 接口化 (6 interfaces in domain/repository.go)
- 14/14 审计问题全部修复 (4 P0 + 4 P1 + 4 P2 + 2 P3)
- Vault Onyx 设计系统统一 Web + Console 两个 App (Stitch 10 屏原型)
- v3 Unstoppable Layer: BIP-39 种子词 + HD 密钥派生 (21 tests PASS)
- 确定性密码派生: seed + site → password (无需存储)
- 新增 /create (种子词 onboarding) + /restore (种子词恢复) 页面
- 13 源密码导入器 (Apple/Google/Chrome/Edge/Firefox/1Password/Bitwarden/LastPass/Dashlane/KeePass/Samsung/NordPass/Enpass)
- 2 轮蜂群战略思考 (10 位顾问): AGI 战略 + Unstoppable 学习
- 22 commits pushed to GitHub (4c3b0b2 → 5aacf59)

---

Maurice | maurice_wen@proton.me
