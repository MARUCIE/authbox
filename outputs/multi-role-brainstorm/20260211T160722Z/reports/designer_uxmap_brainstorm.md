# 设计师角色输出：UX Map 增量建议

## 现状观察
- 现有 UX Map 偏“已登录 Console 任务流”。
- 缺少“自然搜索进入 -> 价值理解 -> 试用转化”的前置旅程。

## 增量旅程（建议加入 UX Map）

### Journey P0：SEO 入口到试用
| Step | 用户动作 | 系统响应 | 证据 |
|---|---|---|---|
| P0-1 | 从搜索进入 Landing/Use Case 页面 | 展示行业痛点与方案对比 | 页面浏览事件 |
| P0-2 | 点击“开始接入” | 导向 Console `platforms/new` | CTA 点击事件 |
| P0-3 | 完成平台创建 | 返回可见成功状态与下一步引导 | Journey A/B 证据 |

### Journey P1：对比页决策
| Step | 用户动作 | 系统响应 | 证据 |
|---|---|---|---|
| P1-1 | 访问 compare 页面 | 展示能力矩阵与边界说明 | 页面浏览事件 |
| P1-2 | 点击“查看审计链示例” | 跳转文档或审计示例页 | 站内跳转事件 |

## 信息架构建议
- Public IA：Landing / Features / Use Cases / Compare / Docs / Pricing / Security
- Console IA：保持现有路由，新增从 Public 到 Console 的稳定入口映射。

## 设计冲突与建议
- 冲突：SEO 页面需要信息密度，Console 需要低认知负担。
- 决策建议：Public 与 Console 视觉系统共享 token，但布局分层，不混用页面目标。
