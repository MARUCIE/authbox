---
Title: notes - initiative_10_auth_box
Scope: project
Owner: ai-agent
Status: active
LastUpdated: 2026-01-29
---

# Notes

## 2026-01-29
- `ai skills run planning-with-files` 因 skill runner ImportError 失败，按技能回退说明手动初始化。

## 2026-01-29（证据）
- 初始化 `doc/` 目录与 `doc/00_project/initiative_10_auth_box/` 下 PDCA 核心文档。
- 更新 `doc/index.md` 的 PATH_INDEX managed block，记录项目根路径。
- 在 `SYSTEM_ARCHITECTURE.md` 与 `USER_EXPERIENCE_MAP.md` 中补齐初始路由映射与步骤引用。
- 初始化 `.codex/ralph-loop.local.md`，设置 max_iterations=12 与 completion_promise=DONE。

## 2026-01-29（技术栈）
- 选定技术栈：Go 后端 + Next.js 控制台 + PostgreSQL 主存储 + Redis 缓存/队列 + OpenAPI 3.1 契约 + KMS 信封加密 + 对象存储归档 + Docker Compose 本地链路。

## 2026-01-29（组件文档）
- 新增 `doc/20_components/auth-box-api/` 组件文档（index/design/api/config/runbook）。
- 完成 MVP API 契约与数据模型草案，作为下一阶段实现依据。

## 2026-01-29（骨架实现）
- 新增 Go API 骨架：`services/api`（/health 可用，路由与配置基线）。
- 新增 Next.js 控制台骨架：`apps/console`（与 UX Map 路由一致的占位页面）。
- 新增 Docker Compose：`docker-compose.yml`（API + Console + PostgreSQL + Redis）。
- `go mod tidy` 失败：本机未安装 Go（`zsh: command not found: go`）。

## 2026-01-29（错误码与审计事件）
- 在 `doc/20_components/auth-box-api/api.md` 中新增错误码列表与审计事件类型。
- 在 `doc/20_components/auth-box-api/design.md` 中补齐审计事件字典与错误码模型。
- 同步更新 PRD 与滚动需求台账。

## 2026-01-29（迁移与保留策略）
- 在 `doc/20_components/auth-box-api/design.md` 增加迁移策略与数据保留策略。
- 在 `doc/00_project/initiative_10_auth_box/PRD.md` 与 `PLATFORM_OPTIMIZATION_PLAN.md` 同步保留策略口径。

## 2026-01-29（Docker 端口冲突处理）
- `docker compose up -d` 遇到宿主端口占用：5432/5433、6379、8080、3000。
- 已移除 PostgreSQL/Redis 端口映射；API 改为宿主 8081；Console 改为宿主 3001。
- UX Map 与 README 已同步端口变更。
- Console 宿主端口调整为 3100（3000/3001 被占用）。
- Console 端口改为动态映射（`ports: - "3000"`），通过 `docker compose port console 3000` 获取宿主端口。

## 2026-01-29（本地运行验证）
- `docker compose up -d` 成功，容器均运行。
- Console 宿主端口：`docker compose port console 3000` → `0.0.0.0:50889`。
- API 健康检查：`curl http://localhost:8081/health` → `{ "status": "ok", "version": "0.1.0" }`。
- 构建日志提示 Next.js 版本存在安全告警，后续需升级到补丁版本。

## 2026-01-29（调研文档分析 - ai_master_control_prd.html）

### 可迁移的核心优化点

#### 1. 概念模型升级（7 个核心对象）
- **Service**：外部平台/应用（provider_id, api_capabilities, auth_type）
- **Account**：用户在某服务上的身份（account_id, identifiers, risk_score）
- **Grant**：OAuth/其他机制授予的访问权（scopes, issued_at, expires_at, refreshable）
- **Consent Record**：用户"同意/拒绝/撤回/目的限制"的机器可读记录（purpose, lawful_basis, timestamp, receipt）
- **Policy**：机器可执行的授权/数据/动作规则（rules, exceptions, enforcement_level）
- **Automation**：可执行工作流（trigger, steps, approvals, rollback）
- **Audit Event**：所有读取/写入/删除/授权变更的不可抵赖记录（who/what/when/why, cryptographic chain）

#### 2. 接管程度刻度（4 级）
- 手动：AI 只做分析与建议，不执行动作
- 辅助（MVP 默认）：AI 生成方案，用户点一次确认后批量执行
- 自动：低风险动作自动执行；高风险仍需确认
- 托管：接近"代管"：需要更强身份验证与合规约束

#### 3. AI 驱动设计（5 条原则）
- 工具白名单：模型只能调用明确的工具；每个工具只做一件事
- 策略前置：任何工具调用先走策略引擎（OPA）判定 allow/deny
- 输出类型化：模型输出必须是结构化 JSON/DSL，经 schema 校验
- 双通道解释：给用户同时展示"将要做什么"和"为什么需要这个权限"
- 回放与撤销：工作流每一步都可回滚

#### 4. 安全基线（5 条）
- 端到端加密：Vault 数据在端侧加密，云端只存密文
- 强身份验证：优先 Passkeys/WebAuthn
- Token 安全：支持 DPoP/绑定型令牌
- 最小权限连接器：每个连接器声明能力矩阵（read/write/delete/export）
- 隔离与最小爆炸半径：每个租户独立密钥域

#### 5. 连接器开发规范（6 条）
- 声明式能力矩阵：每个连接器提供 machine-readable 的 capabilities
- 最小 Scope：只申请必须的 scopes
- 增量同步：必须支持 cursor/watermark
- 幂等与补偿：写/删动作必须幂等；提供补偿动作
- 速率限制：按平台政策做自适应限流
- 输出规范：统一为内部 Canonical Schema

#### 6. 审计事件溯源
```
AuditEvent {
  event_id, timestamp, actor (user/agent/service), action,
  resource_ref (asset/grant/policy), decision (allow/deny/step_up),
  inputs_hash, outputs_hash, reason, signature, prev_event_hash
}
```

### 对 Auth Box MVP 的影响
- PRD：补充概念模型定义、接管程度刻度、AI 驱动设计原则
- SYSTEM_ARCHITECTURE：更新数据模型、引入策略引擎、升级审计模型
- USER_EXPERIENCE_MAP：补充接管程度配置入口
- PLATFORM_OPTIMIZATION_PLAN：增加连接器规范、安全基线、审计溯源

## 2026-01-29（UX Map Journey 0 测试 - 第一次尝试）

### 阻塞（已解决）：Docker daemon 未运行
- 时间：2026-01-29
- 现象：`docker compose ps` 返回 "Cannot connect to the Docker daemon"
- 根因：Docker VM watchdog 检测到父进程消失，VM 已停止
- 解决：完全重启 Docker Desktop（pkill + open）
- 结果：Docker 29.1.3 就绪

## 2026-01-29（UX Map Journey 0 测试 - 通过）

### Step Z1: docker compose up -d
- 时间：2026-01-29T06:55:00Z
- 结果：所有容器启动成功
- 容器状态：
  - 10-auth-box-api-1: Up (8081:8080)
  - 10-auth-box-console-1: Up (59894:3000)
  - 10-auth-box-postgres-1: Up (5432 internal)
  - 10-auth-box-redis-1: Up (6379 internal)

### Step Z2: 访问 Console
- URL: http://localhost:59894
- 结果：页面加载成功
- 验证内容：
  - 标题：Auth Box Console
  - 导航：Platforms, Accounts, Credentials, Assistants, Audit, Settings
  - Dashboard：Active platforms (0), Managed accounts (0), Active credentials (0)
  - Quick start：Connect a platform, Create an account, Issue credentials

### Step Z3: API /health
- URL: http://localhost:8081/health
- 结果：返回 200 OK
- 响应：
  ```json
  {
    "env": "local",
    "status": "ok",
    "time": "2026-01-29T06:55:12Z",
    "version": "0.1.0"
  }
  ```

### Journey 0 结论
- 状态：PASS
- 所有步骤通过，本地最小链路验证成功

## 2026-01-29（Git 初始化）

- 初始化 git 仓库：`git init && git branch -m main`
- 创建 .gitignore（忽略 *.local.md、secrets、build artifacts）
- 初始提交：7f218d2（63 files, 6997 insertions）
- 更新提交：06a7a53（deliverable 更新）

## 2026-01-29（Platform CRUD 实现）

### 新增文件
- `services/api/internal/models/platform.go` - Platform 实体定义与验证
- `services/api/internal/repository/platform.go` - 内存存储（MVP）
- `services/api/internal/handlers/platform.go` - HTTP 处理器
- 更新 `server.go` - 路由注册 `/api/v1/platforms`

### API 测试结果
- `GET /api/v1/platforms` - OK（返回空数组 / 分页列表）
- `POST /api/v1/platforms` - OK（201 Created + JSON body）
- `GET /api/v1/platforms/{id}` - OK（200 / 404）
- `PATCH /api/v1/platforms/{id}` - OK（200 + updated_at 更新）
- `DELETE /api/v1/platforms/{id}` - OK（204 No Content）

### 提交
- commit 311034c: feat(api): implement Platform CRUD endpoints
