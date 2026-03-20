---
Title: 文档索引
Scope: project
Owner: ai-agent
Status: active
LastUpdated: 2026-02-24
Related:
  - /doc/00_project/index.md
  - /doc/10_features/
  - /doc/20_components/
  - /doc/99_archive/
---

# 文档索引

## 硬性规则
- 所有工程文档必须位于 `PROJECT_DIR/doc/`。
- 必须存在索引：`doc/index.md`（本文件）、`doc/00_project/index.md`、以及每个 feature/component 的 `index.md`。

## 目录结构（强制）
- `doc/00_project/`：项目级与 initiative 范围文档
- `doc/10_features/`：功能级文档（每个 feature_slug 一个目录）
- `doc/20_components/`：组件级文档（每个 component_slug 一个目录）
- `doc/99_archive/`：快照与归档

## PATH_INDEX（AI-TOOLS 管理）

<!-- AI-TOOLS:PATH_INDEX:BEGIN -->
- **PROJECT_DIR**: `/Users/mauricewen/Projects/10-auth-box`
- **VERIFIED_AT_UTC**: `2026-02-24T00:00:00Z`
- **Top-level dirs**: `apps`, `packages`, `services`, `doc`
- **Top-level files**: `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `GEMINI.md`, `README.md`, `docker-compose.yml`, `turbo.json`, `pnpm-workspace.yaml`, `Makefile`
- **Key files**: `AGENTS.md`, `CLAUDE.md`, `README.md`, `turbo.json`
- **Monorepo packages**:
  - `packages/crypto` - @authbox/crypto (Argon2id, HKDF, AES-GCM, SRP-6a)
  - `packages/shared` - @authbox/shared (types, constants, utils)
  - `packages/mcp-protocol` - @authbox/mcp-protocol (MCP server + tools)
- **Apps**:
  - `apps/web` - Next.js 15 Web App (React 19, App Router)
  - `apps/extension` - Chrome MV3 Extension (autofill + MCP Server)
- **Services**:
  - `services/api` - Go API Service (SRP auth, vault CRUD, agent gateway)
- **Docs map**:
  - `doc/index.md`
  - `doc/00_project/index.md`
  - `doc/00_project/initiative_10_auth_box/index.md`
  - `doc/00_project/initiative_10_auth_box/PRD.md`
  - `doc/00_project/initiative_10_auth_box/SYSTEM_ARCHITECTURE.md`
  - `doc/00_project/initiative_10_auth_box/USER_EXPERIENCE_MAP.md`
  - `doc/00_project/initiative_10_auth_box/PLATFORM_OPTIMIZATION_PLAN.md`
  - `doc/00_project/initiative_10_auth_box/ROLLING_REQUIREMENTS_AND_PROMPTS.md`
  - `doc/00_project/initiative_10_auth_box/task_plan.md`
  - `doc/00_project/initiative_10_auth_box/notes.md`
  - `doc/00_project/initiative_10_auth_box/deliverable.md`
<!-- AI-TOOLS:PATH_INDEX:END -->

## 变更记录
- 2026-02-24: v2 重写，更新 monorepo 结构映射（Turborepo + pnpm, packages/crypto, packages/shared, apps/web, services/api）。（原因：Auth Box v2 产品方向转型）
- 2026-02-18: 新增专业智能体设计文档索引与路径映射。
- 2026-02-11: 新增 sitemap 与关键词策略文档并回写索引。
- 2026-02-11: 增量更新 API 契约与鉴权同步文档。
- 2026-02-11: 文档索引新增架构 ADR 与风险清单路径。
- 2026-01-29: 初始化。

---

Maurice | maurice_wen@proton.me
