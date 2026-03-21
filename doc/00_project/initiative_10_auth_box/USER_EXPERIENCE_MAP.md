---
Title: USER_EXPERIENCE_MAP - initiative_10_auth_box
Scope: project
Owner: ai-agent
Status: active
LastUpdated: 2026-02-24
Related:
  - /doc/index.md
  - /doc/00_project/index.md
  - /doc/00_project/initiative_10_auth_box/index.md
  - /doc/00_project/initiative_10_auth_box/PRD.md
  - /doc/00_project/initiative_10_auth_box/SYSTEM_ARCHITECTURE.md
---

<!-- AI-TOOLS:PROJECT_DIR:BEGIN -->
- **PROJECT_DIR**: `/Users/mauricewen/Projects/10-auth-box`
- **VERIFIED_AT_UTC**: `2026-02-24T00:00:00Z`
- **RULE**: Always run tasks against the project root. If the CLI detects a mismatch, it will update this block.
<!-- AI-TOOLS:PROJECT_DIR:END -->

# 用户体验地图 - Auth Box v2

## DoD（完成标志）

- Round 1: `ai check` OK -- DONE (6/6 packages, 12/12 pages, 0 errors)
- Round 2: 按本 UX Map 完成模拟人工测试并留证据 -- DONE (7/7 Journeys PASS, 9/9 routes HTTP 200)
- Round 3: 真实 API fixtures 回放通过（no mock）-- DONE (20/20 endpoints, PostgreSQL + Go API, chi routing fix applied)
- Round 4-7: 安全/性能优化 50 项 -- DONE
- Round 8: Fixed-window rate limiter + Arweave E2E -- DONE
- Round 9: Go middleware test suite 19 tests -- DONE
- Round 10: Full-stack SRP E2E rewrite 53 tests -- DONE
- Round 11: 全量 UX Map 模拟测试 -- DONE (8/8 Journeys, 52/52 验证点, 28/28 routes, 131 tests, 16 pages)

## 渠道与入口

| 渠道 | 入口 | 说明 |
|------|------|------|
| Web App | `http://localhost:3010` | Next.js 15 主应用 |
| Chrome Extension | Chrome Web Store / 本地加载 | 密码填充 + MCP Server |
| API | `http://localhost:4010/api/v1` | Go API 服务 |
| MCP Gateway | `ws://localhost:19876/mcp` | AI Agent 凭据网关 |

## Persona 对齐矩阵

| Persona | 角色说明 | 对齐旅程 | 核心入口 |
|---------|----------|----------|----------|
| P0_DEVELOPER | 个人开发者 | Journey A + B + C | `/register`, `/passwords`, Add Password dialog |
| P1_TEAM_LEAD | 团队负责人 | Journey A + B + D + G | `/register`, `/passwords`, `/audit` |
| P2_AI_POWER_USER | AI 深度用户 | Journey A + B + E + F + H | `/register`, `/agents`, `/api-keys`, MCP |
| P3_SECURITY_PRO | 安全敏感用户 | Journey A + B + C + G | `/register`, `/passwords`, `/audit`, `/settings` |
| P4_DEVOPS | DevOps/平台工程师 | Journey A + B + H + E | `/register`, `/api-keys`, `/agents` |

## 关键旅程

### Journey A: 注册

用户创建账号，客户端完成所有加密操作，服务端仅接收加密后的数据。

| Step | 用户动作 | 系统响应 | 技术细节 |
|------|----------|----------|----------|
| A1 | 访问 `/register` | 展示注册表单（email + master password + confirm） | Next.js App Router |
| A2 | 输入 email 和 master password | 客户端校验密码强度（最低 12 字符 + 复杂度） | 实时反馈 |
| A3 | 点击"创建账号" | 客户端执行密钥派生（约 1-2 秒） | Argon2id -> HKDF -> Auth/Enc/MAC Key |
| A4 | -- | 客户端生成随机 Vault Key 并用 Enc Key 包装 | AES-256-GCM |
| A5 | -- | 客户端计算 SRP verifier | g^(Auth Key) mod N |
| A6 | -- | 发送注册请求（email, salt, verifier, encrypted_vault_key） | POST `/api/v1/auth/register` |
| A7 | 看到注册成功提示 | 自动跳转到 `/login` | 提示用户牢记 master password |

**安全要点**: Master Password 永远不离开客户端。服务端收到的是 SRP verifier（无法反推密码）和加密后的 Vault Key（无法解密）。

### Journey B: 登录

SRP 协议实现双向认证：客户端验证服务端身份，服务端验证客户端身份。

| Step | 用户动作 | 系统响应 | 技术细节 |
|------|----------|----------|----------|
| B1 | 访问 `/login` | 展示登录表单（email + master password） | -- |
| B2 | 输入凭据并点击"登录" | 客户端发送 SRP Login Start 请求 | POST `/api/v1/auth/login/start` (email, A) |
| B3 | -- | 服务端返回 (salt, B) | -- |
| B4 | -- | 客户端计算共享密钥 K 和证明 M1 | Argon2id + SRP 计算 |
| B5 | -- | 发送 Login Verify (M1) | POST `/api/v1/auth/login/verify` |
| B6 | -- | 服务端验证 M1，返回 (M2, session_token, encrypted_vault_key) | -- |
| B7 | -- | 客户端验证 M2（双向认证完成） | 确认服务端知道 verifier |
| B8 | -- | 客户端用 Enc Key 解包 Vault Key | AES-256-GCM 解密 |
| B9 | -- | 下载并解密所有 Vault Items | 批量解密到内存 |
| B10 | 看到 Vault 主界面 | 展示解密后的凭据列表 | 跳转到 `/passwords` |

### Journey C: 密码管理

用户在 Vault 中创建、编辑、删除密码条目。所有数据在客户端加密后上传。

| Step | 用户动作 | 系统响应 | 技术细节 |
|------|----------|----------|----------|
| C1 | 点击"Add Password" | 展示条目编辑器（Dialog 覆盖层） | `/passwords` (dialog) |
| C2 | 填写条目信息 | 可选：点击"生成密码"自动填充 | 密码生成器（长度/字符集可配） |
| C3 | 点击"保存" | 客户端用 Vault Key 加密条目数据 | AES-256-GCM |
| C4 | -- | 上传加密后的数据到服务端 | POST `/api/v1/vaults/:vid/items` |
| C5 | 看到条目出现在列表中 | 本地缓存同步更新 | -- |
| C6 | 点击条目查看详情 | 展示解密后的数据（密码默认隐藏） | 内存中已解密 |
| C7 | 点击"复制密码" | 复制到剪贴板并在 30 秒后自动清除 | Clipboard API + setTimeout |
| C8 | 编辑条目并保存 | 重新加密并上传 | PUT `/api/v1/vaults/:vid/items/:id` |
| C9 | 删除条目 | 确认后删除（软删除，30 天回收站） | DELETE `/api/v1/vaults/:vid/items/:id` |

### Journey D: 浏览器扩展

Chrome 扩展检测登录表单，自动填充凭据，保存新凭据。

| Step | 用户动作 | 系统响应 | 技术细节 |
|------|----------|----------|----------|
| D1 | 安装扩展并登录 | 扩展通过 SRP 登录并缓存解密后的 Vault | Extension Popup |
| D2 | 访问某网站的登录页 | Content Script 检测到登录表单 | DOM 特征匹配 |
| D3 | 看到输入框旁的 Auth Box 图标 | 点击图标弹出匹配的凭据列表 | 按域名匹配 |
| D4 | 选择凭据 | 自动填充 username + password | Content Script 填充 |
| D5 | 提交登录表单 | 表单正常提交 | -- |
| D6 | 在新网站注册时 | 扩展提示"保存此凭据？" | 检测表单提交事件 |
| D7 | 点击"保存" | 客户端加密后上传到 Vault | POST `/api/v1/vaults/:vid/items` |

### Journey E: Agent 设置

用户注册 AI Agent 并配置访问策略。

| Step | 用户动作 | 系统响应 | 技术细节 |
|------|----------|----------|----------|
| E1 | 访问 `/agents` | 展示已注册的 Agent 列表 | GET `/api/v1/agents` |
| E2 | 点击"注册新 Agent" | 展示注册表单（名称、类型、允许的 scope） | -- |
| E3 | 填写信息并提交 | 生成 Agent API Key 并展示一次 | POST `/api/v1/agents` |
| E4 | 复制 API Key | 提示"此 Key 仅显示一次" | -- |
| E5 | 配置访问策略 | 设置 scope、rate limit、time window、是否需要审批 | POST `/api/v1/agents/:id/policies` |
| E6 | 查看 Agent 活动 | 展示近期凭据访问记录 | GET `/api/v1/audit?agent_id=...` |

### Journey F: MCP 连接

AI Agent 通过 MCP 协议连接 Auth Box 并请求凭据。

| Step | 角色 | 动作 | 技术细节 |
|------|------|------|----------|
| F1 | Agent | 发现 Auth Box MCP Server | WebSocket `ws://localhost:19876/mcp` |
| F2 | Agent | 发送认证请求（Agent API Key） | JSON-RPC `auth/login` |
| F3 | MCP Server | 验证 API Key 并建立会话 | -- |
| F4 | Agent | 调用 `list_available_services` | JSON-RPC tool call |
| F5 | MCP Server | 查询策略引擎，返回可访问的服务列表 | Policy check |
| F6 | Agent | 调用 `get_credential("github.com")` | JSON-RPC tool call |
| F7 | MCP Server | 策略引擎裁决（allow/deny/step_up） | Policy Engine |
| F8a | (allow) | 从本地 Vault 获取凭据并返回 | 内存中已解密 |
| F8b | (deny) | 返回拒绝原因 | error response |
| F8c | (step_up) | 弹出审批提示，等待用户确认 | Extension notification |
| F9 | MCP Server | 记录审计事件 | POST `/api/v1/audit` (async) |

### Journey G: OAuth 管理

用户连接 OAuth Provider，系统自动刷新 Token 并监控状态。

| Step | 用户动作 | 系统响应 | 技术细节 |
|------|----------|----------|----------|
| G1 | 访问 `/authorizations` | 展示已连接的 OAuth Provider 列表 | GET `/api/v1/connections` |
| G2 | 点击"连接新服务" | 选择 Provider（Google/GitHub/Microsoft...） | -- |
| G3 | 完成 OAuth 流程 | 系统获取 access_token + refresh_token | 标准 OAuth 2.0 流程 |
| G4 | -- | 客户端加密 Token 后上传 | AES-256-GCM with Vault Key |
| G5 | 查看连接状态 | 展示 Token 过期时间、scope、上次刷新时间 | -- |
| G6 | Token 即将过期 | 系统自动刷新并更新加密存储 | 后台定时任务 |
| G7 | 断开连接 | 吊销 Token 并删除加密存储 | DELETE + OAuth revoke |

### Journey H: API Keys 与 .env 导入

用户导入项目 .env 文件，系统自动识别 70+ AI 基建 Provider 凭据，加密存储到 Vault。

| Step | 用户动作 | 系统响应 | 技术细节 |
|------|----------|----------|----------|
| H1 | 访问 `/api-keys` | 展示已存储的 API Key 列表（按分类分组） | GET `/api/v1/vault/items` (type=api_key) |
| H2 | 点击"Import .env"，拖入 .env 文件 | 客户端解析文件，提取 KEY=VALUE 对 | parseEnvFile() / parseJsonConfig() |
| H3 | -- | 自动匹配 100+ env var 模式，分类到 15 个 Provider 类别 | matchEnvVar() + ENV_PATTERNS |
| H4 | 预览分类结果，勾选要导入的 Provider | 按 Category 分组展示，显示字段数 | GroupedCredential |
| H5 | 点击"Import N credentials" | 逐个加密并上传，显示进度条 | AES-256-GCM + POST vault/items |
| H6 | 看到导入完成提示 | 自动同步 Vault | syncVault() |
| H7 | 在列表中点击"verify" | 客户端 ping Provider API 验证 Key 有效性 | checkCredentialHealth() |
| H8 | 看到 valid/invalid/expired 状态 | 显示状态 + 延迟 | 20 provider verifiers |

**安全要点**: .env 文件在浏览器本地解析，明文 Key 直接用 Vault Key 加密后上传。Health check 直接从浏览器调用 Provider API（如 api.openai.com），不经过 Auth Box 服务端。

## 路由地图

### Web App Routes

| 路由 | 页面 | 认证 | Phase | 实现方式 |
|------|------|------|-------|----------|
| `/` | 落地页（三支柱 + 信任信号） | 无 | 0 | Server Component |
| `/register` | 注册（含密码强度指示器） | 无 | 0 | Client Component |
| `/login` | 登录（SRP 多步进度） | 无 | 0 | Client Component |
| `/unlock` | 解锁（Session 有效但 Vault 锁定） | Session | 0 | Client Component |
| `/create` | 助记词创建 | 无 | 0 | Client Component |
| `/restore` | 助记词恢复 | 无 | 0 | Client Component |
| `/passwords` | 密码列表 + 搜索 + 新建/编辑/详情 | Session + Vault | 1 | 单页 + Dialog/侧边栏 |
| `/api-keys` | API Key 管理 + .env 导入 + 健康检查 | Session + Vault | 3 | 单页 + 多步导入流 |
| `/authorizations` | OAuth 连接列表 + 新建/详情 | Session + Vault | 2 | 单页 + Dialog/侧边栏 |
| `/agents` | AI Agent 列表 + 注册/详情/策略 | Session | 2 | 单页 + Dialog/侧边栏 |
| `/audit` | 审计日志（分页 + 哈希链验证） | Session | 1 | Client Component |
| `/settings` | 会话管理 + TOTP 2FA | Session | 1 | Client Component |

### API Routes

参见 `SYSTEM_ARCHITECTURE.md` 的 API 路由章节。

---

Maurice | maurice_wen@proton.me
