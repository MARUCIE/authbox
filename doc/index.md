---
Title: 文档索引
Scope: project
Owner: ai-agent
Status: active
LastUpdated: 2026-02-11
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
- **VERIFIED_AT_UTC**: `2026-02-11T15:11:00Z`
- **Top-level dirs**: `.codex`, `apps`, `doc`, `services`
- **Top-level files**: `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `GEMINI.md`, `README.md`, `docker-compose.yml`
- **Key files**: `AGENTS.md`, `CLAUDE.md`, `README.md`
- **Docs map**:
  - `doc/index.md`
  - `doc/00_project/index.md`
  - `doc/00_project/initiative_10_auth_box/index.md`
  - `doc/00_project/initiative_10_auth_box/PRD.md`
  - `doc/00_project/initiative_10_auth_box/SYSTEM_ARCHITECTURE.md`
  - `doc/00_project/initiative_10_auth_box/ARCHITECTURE_ADR.md`
  - `doc/00_project/initiative_10_auth_box/ARCHITECTURE_RISK_REGISTER.md`
  - `doc/00_project/initiative_10_auth_box/USER_EXPERIENCE_MAP.md`
  - `doc/00_project/initiative_10_auth_box/PLATFORM_OPTIMIZATION_PLAN.md`
  - `doc/00_project/initiative_10_auth_box/SITEMAP_KEYWORD_STRATEGY.md`
  - `doc/00_project/initiative_10_auth_box/EXECUTION_ROADMAP.md`
  - `doc/00_project/initiative_10_auth_box/PDCA_EXECUTION_PLAN.md`
  - `doc/00_project/initiative_10_auth_box/PDCA_ITERATION_CHECKLIST.md`
  - `doc/00_project/initiative_10_auth_box/ROLLING_REQUIREMENTS_AND_PROMPTS.md`
  - `doc/00_project/initiative_10_auth_box/task_plan.md`
  - `doc/00_project/initiative_10_auth_box/notes.md`
  - `doc/00_project/initiative_10_auth_box/deliverable.md`
  - `doc/00_project/initiative_10_auth_box/REQUIREMENT_CONFIRMATION_ZH_FR.md`
  - `doc/20_components/auth-box-api/index.md`
  - `doc/20_components/auth-box-api/design.md`
  - `doc/20_components/auth-box-api/api.md`
  - `doc/20_components/auth-box-api/config.md`
  - `doc/20_components/auth-box-api/runbook.md`
  - `doc/20_components/auth-box-console/index.md`
  - `doc/20_components/auth-box-console/design.md`
  - `doc/20_components/auth-box-console/runbook.md`
<!-- AI-TOOLS:PATH_INDEX:END -->

## 变更记录
- 2026-02-11: 新增 sitemap 与关键词策略文档并回写索引。（原因：multi-role-brainstorm SOP）
- 2026-02-11: 增量更新 API 契约与鉴权同步文档（组件契约、runbook、PDCA 回写）。（原因：api-contract-auth-sync SOP）
- 2026-02-11: 文档索引新增架构 ADR 与风险清单路径。（原因：architecture council SOP）
- 2026-01-29: 初始化。（原因：新项目启动）
