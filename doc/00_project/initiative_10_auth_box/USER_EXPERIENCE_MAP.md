---
Title: USER_EXPERIENCE_MAP - initiative_10_auth_box
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
---

<!-- AI-TOOLS:PROJECT_DIR:BEGIN -->
- **PROJECT_DIR**: `/Users/mauricewen/Projects/10-auth-box`
- **VERIFIED_AT_UTC**: `2026-01-29T02:48:34Z`
- **RULE**: Always run tasks against the project root. If the CLI detects a mismatch, it will update this block.
<!-- AI-TOOLS:PROJECT_DIR:END -->

# 用户体验地图 - Auth Box

## DoD（完成标志）
- Round 1: `ai check` OK
- Round 2: 按本 UX Map 完成模拟人工测试并留证据

## 渠道与入口
- Web 控制台（Next.js）：`/`
- API 客户端：`/api/v1/*`
- AI 助手网关：由 API 接入并记录审计

## 关键旅程

### Journey 0: 本地最小链路启动
| Step | 用户动作 | 系统响应 | 证据/产物 |
|---|---|---|---|
| Z1 | `docker compose up -d` | 启动 API/Console/PostgreSQL/Redis | 终端输出 |
| Z2 | 运行 `docker compose port console 3000`，打开输出的 URL | 展示控制台骨架首页 | 页面截图 |
| Z3 | 访问 `http://localhost:8080/health` | 返回健康检查结果 | API 响应 |

### Journey A: 平台初始化
| Step | 用户动作 | 系统响应 | 证据/产物 |
|---|---|---|---|
| A1 | 进入平台配置页（`/platforms/new`） | 校验平台参数与权限 | 页面截图/日志 |
| A2 | 保存配置（`/platforms/:id`） | 返回连接状态与可用能力 | API/日志记录 |

### Journey B: 账号自动创建
| Step | 用户动作 | 系统响应 | 证据/产物 |
|---|---|---|---|
| B1 | 创建账号（`/accounts/new`） | 调用平台 API 创建账号 | 账号记录/审计日志 |
| B2 | 查看账号详情（`/accounts/:id`） | 展示账号状态与授权绑定 | 页面截图/记录 |

### Journey C: 授权管理
| Step | 用户动作 | 系统响应 | 证据/产物 |
|---|---|---|---|
| C1 | 创建授权（`/credentials`） | 生成 API Key/OAuth Token | 凭据记录 |
| C2 | 轮换/吊销授权（`/credentials/:id/rotate`） | 更新凭据状态 | 审计日志 |

### Journey D: AI 助手接入
| Step | 用户动作 | 系统响应 | 证据/产物 |
|---|---|---|---|
| D1 | 绑定 AI 助手（`/assistants/new`） | 验证权限范围 | 绑定记录 |
| D2 | 发起调用（API） | 通过网关访问外部平台 | 调用日志 |

### Journey E: 审计与合规
| Step | 用户动作 | 系统响应 | 证据/产物 |
|---|---|---|---|
| E1 | 查询操作日志（`/audit`） | 返回可审计记录（Event Sourcing with hash chain） | 日志导出 |
| E2 | 导出报告（`/audit/exports`） | 生成审计报告 | 导出文件 |

### Journey F: 接管程度配置（来自调研 ai_master_control_prd.html）
| Step | 用户动作 | 系统响应 | 证据/产物 |
|---|---|---|---|
| F1 | 进入设置页（`/settings`） | 展示当前接管程度（默认辅助） | 页面截图 |
| F2 | 选择接管程度（手动/辅助/自动/托管） | 保存配置 | 审计日志 |
| F3 | 配置高风险动作确认策略 | 更新 Policy | 策略记录 |

## 接管程度说明

| 模式 | 用户体验 | 适用场景 |
|------|----------|----------|
| 手动 | AI 只建议，用户手动执行每个动作 | 高敏感用户 |
| 辅助（MVP 默认） | AI 生成方案，用户一次确认后批量执行 | 标准接入 |
| 自动 | 低风险自动执行，高风险弹窗确认 | 稳定期用户 |
| 托管 | 完全托管，需更强验证 | 遗产/监护 |
