# API 契约与鉴权同步报告

## Run
- SOP ID: `api-contract-auth-sync`
- Run ID: `20260211T154715Z`
- Evidence Root: `outputs/api-contract-auth-sync/20260211T154715Z`

## 目标与范围
1. 对齐 API 契约、鉴权模型与配置入口。
2. 明确权限边界并补齐缺口。
3. 同步调用方并补齐契约测试。
4. 使用真实 API 回放与 `ai check` 完成验证。

## 实施变更
- 鉴权入口：`services/api/internal/server/auth_middleware.go`
  - `AUTH_BOX_AUTH_TOKENS` 解析新增 role 白名单校验（未知/空 role 直接失败）。
  - 新增 401 拒绝审计事件 `AUTHN_TOKEN_VALIDATE`。
- 审计补齐：
  - `services/api/internal/handlers/platform.go`：新增 `PLATFORM_CREATED/UPDATED/DELETED` 事件写入。
  - `services/api/internal/handlers/account.go`：新增 `ACCOUNT_PROVISIONED` 与 `ACCOUNT_STATUS_CHANGED`（状态变更时）事件写入。
- 调用方同步：
  - `apps/console/lib/api.ts`：新增 `AUTH_BOX_CONSOLE_AUTH_SOURCE`/`NEXT_PUBLIC_API_AUTH_SOURCE`，统一透传 `X-Auth-Source`。
  - `apps/console/app/platforms/page.tsx`：可视化展示 `auth source`。
  - `docker-compose.yml`：新增 `AUTH_BOX_CONSOLE_AUTH_SOURCE=console`。
- 契约测试补齐：
  - `services/api/internal/server/auth_middleware_test.go`：新增未知 role/空 role 负例。
  - `services/api/internal/server/contract_loop_test.go`：新增权限矩阵 + source 透传断言，补充 401/403 `request_id` 断言。
- 闭环守门脚本：`scripts/full_loop_closure_check.sh` 新增 console 来源环境变量入口检查。

## 破坏性变更（Breaking Changes）
- `AUTH_BOX_AUTH_TOKENS` 不再接受未注册角色或空角色；配置错误会导致 API 启动失败。
- Console 默认发送 `X-Auth-Source`，审计来源统计口径从“默认 api”升级为“调用方显式来源”。

## 验证结果
- 全量 Go 测试：PASS
  - 日志：`outputs/api-contract-auth-sync/20260211T154715Z/logs/go_test_all.log`
- Console 生产构建：PASS
  - 日志：`outputs/api-contract-auth-sync/20260211T154715Z/logs/console_build.log`
- 真实 API 回放（no mock）：PASS
  - 日志：`outputs/api-contract-auth-sync/20260211T154715Z/logs/real_api_replay.log`
  - 报告：`outputs/api-contract-auth-sync/20260211T154715Z/replay/reports/run_report.json`
  - 关键指标：`event_count=9`, `deny_event_count=2`, `required_fields_ok=true`, `chain_link_ok=true`
- ai check：PASS
  - 日志：`outputs/api-contract-auth-sync/20260211T154715Z/logs/ai_check_final.log`

## 文档回写
- API 契约：`doc/20_components/auth-box-api/api.md`
- API 配置/运行手册：`doc/20_components/auth-box-api/config.md`, `doc/20_components/auth-box-api/runbook.md`
- Console runbook：`doc/20_components/auth-box-console/runbook.md`
- PDCA：`doc/00_project/initiative_10_auth_box/PRD.md`, `doc/00_project/initiative_10_auth_box/SYSTEM_ARCHITECTURE.md`, `doc/00_project/initiative_10_auth_box/USER_EXPERIENCE_MAP.md`, `doc/00_project/initiative_10_auth_box/PLATFORM_OPTIMIZATION_PLAN.md`
