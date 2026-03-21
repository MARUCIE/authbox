# Auth Box v5 系统架构审计报告

> 审计日期: 2026-03-21
> 审计对象: `SYSTEM_ARCHITECTURE.md` (LastUpdated: 2026-03-21)
> 交叉对照: PRD.md / USER_EXPERIENCE_MAP.md / PLATFORM_OPTIMIZATION_PLAN.md

---

## 审计总览

| 维度 | 评级 | 核心发现 |
|------|------|---------|
| 完整性 | PASS | 7 大领域全覆盖（密码学/存储/同步/身份/Agent/审计/部署） |
| 一致性 | WARN | Mermaid 图与文本基本一致，但 PDCA 4 文档之间存在版本漂移 |
| 可行性 | WARN | Arweave + Bitcoin 技术方案合理，但存在 3 个实操缺口 |
| 安全性 | WARN | 整体安全模型扎实，但种子词处理和 Arweave 元数据存在 2 个风险点 |
| PDCA 对齐 | FAIL | PRD 和 UX Map 仍停留在 v2 视角，未同步 v3-v5 新旅程 |

---

## 1. 完整性审计

### PASS -- 架构覆盖完整

v5 架构文档覆盖了以下 7 个必要领域：

| 领域 | 章节 | 评价 |
|------|------|------|
| 密码学/密钥派生 | 4. 密钥派生体系 | BIP-39 + HD 分层确定性派生路径清晰，5 条路径各有明确用途和轮换策略 |
| 存储 | 6. 永久存储架构 | Arweave + IPFS + Bitcoin 四层冗余设计完备 |
| 同步 | 3. 高层架构 Layer 2 | CRDT + 4 种传输方式（Relay/P2P/WebDAV/Export） |
| 身份/认证 | 10. 安全模型 | SRP-6a (v2 兼容) + Ed25519 签名 (v3+) 双认证体系 |
| Agent 治理 | 5. 五原语架构 | Capability/Intent/Policy/Effect/Fact 正交模型 |
| 审计 | 5.5 FACT + 8. DB Schema | 哈希链 + Bitcoin 锚定 + 序列号 |
| 部署 | 11. 部署架构 | CDN/前端/API/永久存储/客户端五层 |

补充观察:
- 优雅降级谱系（第 7 章）是亮点，Level 0-4 五级降级路径设计清晰
- 版本演进表（第 2 章）v1-v5 脉络清楚，每版定位明确
- 系统边界（第 13 章）明确划定 in-scope/out-of-scope

### 缺失项（建议补充）

| 项 | 严重度 | 说明 |
|----|--------|------|
| 密钥轮换流程 | MEDIUM | vault key "不轮换" 在助记词泄露场景下无恢复路径。需要 re-key 流程设计 |
| 多设备冲突解决 | LOW | CRDT 提到但未展开冲突解决策略（特别是 Vault Item 级别） |
| 灾难恢复 SLA | LOW | 四层冗余覆盖了"能恢复"，但未定义恢复时间目标 (RTO/RPO) |

---

## 2. 一致性审计

### PASS -- Mermaid 图与文本一致

逐图核验结果：

| 图表 | 位置 | 结果 | 备注 |
|------|------|------|------|
| 高层三层架构图 | 第 3 章 | PASS | Layer 1/2/3 划分与文本描述一致 |
| 五原语流程图 | 第 5 章 | PASS | INTENT->POLICY->CAP->EFFECT->FACT 与 TypeScript 接口定义一致 |
| 存储时序图 | 第 6 章 | PASS | 三并行路径 (Arweave/IPFS/BTC) 与四层冗余表格一致 |
| SRP 时序图 | 第 10.1 章 | PASS | 注册+登录双阶段与 API 路由表一致 |
| MCP 网关时序图 | 第 10.6 章 | PASS | 五原语映射到 MCP 交互流程正确 |
| 部署架构图 | 第 11 章 | PASS | 组件与技术栈表格一致 |
| ER 图 | 第 8 章 | PASS | 8 张表的关系与字段定义一致 |

### WARN -- API 路由与五原语的映射缺口

| 原语 | 对应 API | 状态 |
|------|---------|------|
| CAPABILITY | `POST /agents/:id/capability` | PASS |
| INTENT | 无专属端点 | WARN -- Intent 在 MCP 网关内部创建，但无 REST API 查询/列举接口 |
| POLICY | `POST /agents/:id/policies` | PASS |
| EFFECT | 通过 Gateway 执行 | PASS（内部流程） |
| FACT | `GET /audit` + `GET /audit/verify` | PASS |

建议: 补充 `GET /api/v1/intents` 端点，允许用户查看 Agent 的历史意图记录，提升可审计性。

### FAIL -- PDCA 4 文档版本漂移

| 文档 | LastUpdated | 覆盖版本 | 问题 |
|------|------------|---------|------|
| SYSTEM_ARCHITECTURE.md | 2026-03-21 | v5 | 基准文档 |
| PRD.md | 2026-02-24 | v2 (标题) | 标题仍为 "Auth Box v2"，里程碑表虽列出 M5.0/M5.1/M5.2 但正文 Persona/功能需求/核心设计原则仍是 v2 视角 |
| USER_EXPERIENCE_MAP.md | 2026-02-24 | v2 | 7 条旅程 (A-G) 全部基于 v2，缺少 v3+ 新旅程: 种子词创建、种子词恢复、确定性密码、Arweave 存档、Bitcoin 锚定验证 |
| PLATFORM_OPTIMIZATION_PLAN.md | 2026-02-13 | v2 | 未提及 v5 永久存储相关的性能/成本优化（Arweave 费用、BTC 手续费、IPFS pin 成本） |

---

## 3. 可行性审计

### PASS -- 核心方案技术可行

| 技术 | 可行性 | 依据 |
|------|--------|------|
| BIP-39 助记词 | 成熟 | 加密货币行业标准，大量生产级实现 |
| HD 密钥派生 | 成熟 | BIP-32/44 标准，`@noble/hkdf` 等库可直接使用 |
| AES-256-GCM 客户端加密 | 成熟 | WebCrypto API 原生支持 |
| Ed25519 签名认证 | 成熟 | `@noble/ed25519` 等库，性能优于 SRP |
| Arweave 永久存储 | 可行 | 生态活跃，bundlr/irys SDK 可用，~$0.005/KB 成本准确 |
| Bitcoin OP_RETURN | 可行 | 80 字节限制足够存放 32 字节 SHA-256 哈希 |
| CRDT 同步 | 可行 | Yjs/Automerge 等库成熟 |

### WARN -- 3 个实操缺口

**缺口 1: Arweave 恢复时的 TX ID 发现问题**

文档提到两种恢复路径:
1. 已知 `arweave_tx_id` (存储在 vault metadata 中) -- 但如果本地数据全丢，metadata 也丢了
2. "scan Arweave for blobs tagged with auth_key public key" -- 这是兜底

问题: Arweave GraphQL 查询按标签搜索的性能和可靠性未验证。如果用户有数百次存档，搜索和排序（找到最新版本）的策略未定义。

建议:
- 定义 Arweave 标签的标准化 schema（如 `App-Name: AuthBox`, `Version: <n>`, `Public-Key-Hash: <hash>`）
- 设计一个轻量级的 "manifest transaction" 指向最新 vault blob 的 TX ID
- 备选: 将最新 TX ID 编码进确定性派生路径（如 seed + "latest" -> lookup key）

**缺口 2: Bitcoin 锚定的批次策略未定义**

MCP 网关时序图中标注 "periodic anchor (batch)"，但未定义:
- 批次间隔（每 N 分钟？每 N 条 Fact？）
- 批次内的 Merkle Tree 构造方式
- 单笔 BTC 交易的聚合哈希算法
- 费用承担者（用户 or 平台？每笔 ~$0.50 在高频场景下会累积）

建议: 参考 OpenTimestamps 协议，使用 Merkle Tree 将多条 Fact 哈希聚合为一个根哈希，定期（如每 24 小时）锚定一次。

**缺口 3: IPFS Pin 服务的持续性**

四层冗余中 L2 IPFS 标注 "取决于 pin 服务"，使用 web3.storage。但:
- web3.storage 已转型为 w3up（需要付费计划）
- 无 pin 服务 = IPFS 数据会被垃圾回收
- 作为冗余层，需要明确 pin 服务的生命周期管理

建议: 明确 IPFS 仅作为临时冗余（L1 Arweave 为永久），或切换到 Filecoin/Storacha 等有 SLA 保证的服务。

---

## 4. 安全审计

### PASS -- 整体安全模型

| 安全特性 | 评级 | 说明 |
|----------|------|------|
| 零知识架构 | PASS | 服务端永远无法解密，密钥派生全在客户端 |
| 256 位熵 | PASS | 24 词 BIP-39 = 2^256，暴力破解不可行 |
| 凭据内存擦除 | PASS | Effect 执行后 30 秒内覆写，合理 |
| 哈希链审计 | PASS | prev_hash 链式结构 + BTC 锚定双保险 |
| 信任层级 | PASS | T0-T3 四层分级合理，T3 始终拒绝是正确的 |
| 已完成的加固 | PASS | Round 4-7 共 50 项修复，覆盖 CSP/CORS/SRP 校验/Rate Limit 等 |

### WARN -- 种子词处理的 2 个风险

**风险 1: PBKDF2 迭代次数偏低**

文档指定 `PBKDF2-HMAC-SHA512, 2048 iterations`。这个迭代次数偏低:
- NIST SP 800-132 (2023 更新) 建议至少 600,000 次迭代
- 1Password 使用 650,000 次
- Bitwarden 使用 600,000 次
- BIP-39 标准用 2048 次是因为助记词本身有 256 位熵（无需抵抗暴力破解），但如果用户选择了弱助记词（如自定义词表）则风险增大

评估: 由于 BIP-39 标准助记词本身熵足够高，2048 次在标准流程下可接受。但如果系统允许用户自定义助记词或使用非标准词表，则需要提升到 600,000+ 次。

建议: 明确文档中禁止自定义助记词（仅系统生成），或将迭代次数提升到 600,000+。

**风险 2: Arweave 元数据标签的关联性**

文档声称:
> "元数据标签仅包含 auth_key 公钥（不泄露身份信息）"

但后续又说:
> "元数据标签仅包含 auth_key 公钥的哈希（不可逆推身份）"

两处描述不一致（公钥 vs 公钥哈希）。无论哪种:
- 如果用同一个公钥/哈希标记所有存档，攻击者可以关联同一用户的所有 Vault 版本
- 虽然无法解密，但可以观测存档频率、大小变化等元数据
- 如果公钥在其他场景被关联到真实身份（如 Ed25519 认证注册），则 Arweave 上的存档历史将暴露

建议:
- 使用公钥哈希（而非公钥本身）作为标签
- 考虑为每次存档派生临时标签密钥（`m/ABX'/archive'/n'`），增加不可关联性
- 明确文档中两处描述，统一为一种方案

### 额外安全建议

| 项 | 严重度 | 说明 |
|----|--------|------|
| 助记词泄露后的 re-key | HIGH | 如果 24 词泄露，当前架构无法轮换 vault key（因为 vault key 路径固定为 `m/ABX'/vault'/0'`）。需要设计 re-key 流程: 生成新助记词 -> 用旧 key 解密 -> 用新 key 重新加密 -> 上传新 Arweave blob -> 标记旧 blob 为废弃 |
| 确定性密码的域名变更 | MEDIUM | `HMAC-SHA256(derive_key, domain + ":" + username + ":" + version)` -- 如果网站更换域名，密码无法迁移。需要域名别名机制 |
| MCP 网关 localhost 暴露面 | MEDIUM | `ws://localhost:19876` 在本地运行，但任何本地进程都可连接。需要身份验证 + 来源校验（如 Chrome Extension ID 白名单） |

---

## 5. PDCA 对齐审计

### FAIL -- PRD 与架构文档版本不一致

| 对齐项 | 状态 | 差异详情 |
|--------|------|---------|
| PRD 标题 | FAIL | PRD 标题为 "Auth Box v2"，架构已是 v5 |
| PRD 核心设计原则 | FAIL | PRD 仍以 "Master Password 永不离开客户端" 为核心，未更新为种子词主权 |
| PRD 功能需求 | FAIL | Phase 0-4 已完成但未标记；v3-v5 的功能需求（种子词、Arweave、Bitcoin、五原语）未列入 |
| PRD 风险 | WARN | 未列入 Arweave 网络稳定性、Bitcoin 手续费波动等 v5 新风险 |
| PRD Persona | WARN | P3_SECURITY_PRO 的核心需求未更新（种子词主权 > 零知识加密） |
| PRD 里程碑 | PASS | M5.0/M5.1/M5.2 已列入 |
| UX Map 旅程 | FAIL | 缺少 5 条 v3+ 新旅程（见下表） |
| UX Map 路由 | FAIL | 缺少 `/create`（种子词 onboarding）和 `/restore`（种子词恢复）路由 |
| 优化计划 v5 成本 | FAIL | 未包含 Arweave/IPFS/Bitcoin 的成本预算和优化策略 |

### 缺失的 UX Map 旅程

| 旅程 ID | 名称 | 覆盖功能 |
|---------|------|---------|
| Journey H | 种子词创建 (Onboarding) | BIP-39 生成 -> 抄写验证 -> vault key 派生 -> 首次加密 |
| Journey I | 种子词恢复 | 输入 24 词 -> 派生 vault key -> Arweave 搜索 -> 解密恢复 |
| Journey J | 确定性密码使用 | 选择域名 -> 自动派生密码 -> 无需存储 |
| Journey K | Arweave 存档管理 | 手动/自动存档 -> 查看存档状态 -> 验证完整性 |
| Journey L | 审计链验证 | 查看哈希链 -> Bitcoin 锚定验证 -> 导出合规报告 |

---

## 6. 综合建议

### P0 (必须修复)

1. **同步 PRD 到 v5**: 更新标题、核心原则、功能需求、Persona 描述、风险表。将 v3-v5 功能需求纳入正文
2. **同步 UX Map**: 补充 Journey H-L（种子词、恢复、确定性密码、存档、审计验证），补充 `/create` 和 `/restore` 路由
3. **统一 Arweave 标签描述**: 第 6 章和第 10.3 章关于"公钥 vs 公钥哈希"的描述不一致，需统一

### P1 (强烈建议)

4. **设计 re-key 流程**: 助记词泄露时的密钥轮换方案，包括 Arweave 旧 blob 标记废弃
5. **定义 Bitcoin 批次策略**: 间隔、聚合算法、费用模型（建议参考 OpenTimestamps）
6. **定义 Arweave TX ID 发现策略**: 标准化标签 schema + manifest transaction 方案
7. **同步优化计划**: 补充 Arweave/IPFS/Bitcoin 的成本预算章节

### P2 (建议)

8. **明确 PBKDF2 迭代次数策略**: 要么禁止自定义助记词并保持 2048，要么提升到 600K+
9. **补充 CRDT 冲突解决设计**: Vault Item 级别的冲突合并策略
10. **补充 Intent 查询 API**: `GET /api/v1/intents` 提升 Agent 行为可审计性
11. **确定性密码域名别名**: 支持域名变更后的密码迁移
12. **MCP localhost 安全加固**: Extension ID 白名单 + 进程来源校验

---

## 决策日志条目

```
ID:       ADR-AUTHBOX-2026-0321-001
Date:     2026-03-21
Title:    v5 架构审计 -- PDCA 同步 + 3 个技术缺口
Decision: SYSTEM_ARCHITECTURE.md v5 设计整体 PASS，但 PDCA 4 文档存在版本漂移（PRD/UX Map 仍为 v2），
          需同步更新。同时需补充: (1) Arweave TX ID 发现策略 (2) Bitcoin 批次锚定策略 (3) re-key 流程。
Status:   PROPOSED
Options:
  A. 仅更新架构文档，PRD/UX Map 延后 -- 风险: 团队认知不一致，v5 新旅程无 UX 规范
  B. 立即同步全部 4 文档 + 补充 3 个技术缺口 -- 推荐: 一次性对齐，避免后续返工
  C. 拆分为两批: 先同步 PDCA 4 文档 (1 天)，再补充技术缺口 (2-3 天) -- 折中: 降低单次工作量
Recommend: 选项 C -- 先确保 PDCA 一致性（阻塞后续开发），再逐个补充技术缺口
```

---

Maurice | maurice_wen@proton.me
