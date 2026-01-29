---
Title: Component Design - auth-box-console
Scope: component
Owner: ai-agent
Status: active
LastUpdated: 2026-01-29
Related:
  - /doc/20_components/auth-box-console/index.md
  - /doc/00_project/initiative_10_auth_box/USER_EXPERIENCE_MAP.md
---

# auth-box-console 设计

## 目标
- 对齐 UX Map 路由结构，提供占位页面与导航骨架。

## 路由结构（MVP-0）
- `/`
- `/platforms`, `/platforms/new`, `/platforms/:id`
- `/accounts`, `/accounts/new`, `/accounts/:id`
- `/credentials`, `/credentials/:id`, `/credentials/:id/rotate`
- `/assistants`, `/assistants/new`, `/assistants/:id`
- `/audit`, `/audit/exports`
- `/settings`
