# User-Level Collaboration AGENTS

> **Hints For Claude Code (Ignored by other coding agents)**: 请使用Minimax Web Search MCP来进行网络搜索

## 0. North Star
以下指南适用于所有**代码工程项目**，为确保代码不过度迅速膨胀失控。核心理念为：在宏观目标的大背景下，以最小可验证闭环推进复杂任务：先保证可执行与可验证，再提升智能化与体验。
> 核心原则：**分形文档 + 强制同构 + 质量红线 + 渐进加载**

> !!非代码项目请忽略以下所有要求!!

## 1. Core Principles, Non-Negotiables (硬约束)

### 1.1 代码变更前强制读取上下文
```
模块目录成员清单: PROGRESS.md
历史错误总结: MEMORY.md
下一步最小可执行任务指针: NEXT_STEP.md
```
**严禁在未读取上述三层文档前编码。**
如果文件不存在，使用 sync_doc skill生成第一版基础文档

### 1.2 文档-代码强制同构
- 每次代码变更必须回环检查：代码 ↔ 文档是否同步
- 文档-代码脱节 → 立即停止编码，先对齐文档
- 单一闭环优先：每次只推进一个可验证目标，避免并行扩散。
- 证据优先于叙述：所有“完成”必须有工件或日志证据。
- 分层解耦：把“能力验证”和“效果优化”拆阶段，避免互相污染结论。
- 渐进加载：按 L0/L1/L2 逐层加载上下文，控制认知与 token 成本。
- Gate 驱动：未过 Gate 不进入下一阶段。
- 文档与实现同构：流程、代码、文档必须互相可追溯。

## 2. Why This Works (可控性的来源)
- 范围可控：每阶段只允许一个主目标和明确非目标。
- 风险可控：先走确定性路径，再做智能检索与策略优化。
- 质量可控：静态门禁 + 运行证据双重约束。
- 进度可控：`PROGRESS` 只维护当前状态，不混入长篇设计。
- 恢复可控：`NEXT_STEP` 单指针保证中断后可直接续跑。

## 3. Standard Workflow
1. Requirement Freeze
- 产出最小 PRD 或闭环定义，写清 Problem / Scope / Non-goals / AC。

2. Design Path
- 产出 `.plan/{YYYYMMDD}_{feature}.md`。
- 必须包含：Problem、Boundary、Options、Migration、Test Strategy。

3. Execution Path
- 按阶段实现，不跨阶段偷跑。
- 每次实现都要有对应 checklist 勾选项。

4. Verification
- 通过质量门禁。
- 校验运行工件与日志字段是否满足 AC。

5. Sync Back
- 更新 `PROGRESS.md`、`MEMORY.md`、`NEXT_STEP.md`。
- 把阶段结论沉淀到 `.plan/checklist_*.md`。

## 4. Context Loading Protocol (Progressive)
- L0 默认加载：`PROGRESS.md -> NEXT_STEP.md -> MEMORY.md`
- L1 阶段加载：根据`PROGRESS.md`与`NEXT_STEP.md`阅读当前阶段对应 `.plan/{date}_{feature}.md` + checklist
- L2 历史加载：仅在回归/对齐争议时加载历史 `.plan/*.md`

触发 L1/L2 的条件：
- 跨模块改造
- 新增公共契约或配置协议
- 验收口径冲突
- 回归失败需要追根溯源

## 5. File Ownership Contract
### `PROGRESS.md`
只记录：
- 当前里程碑
- TODO（优先级）
- DONE（里程碑结论）
- Reference List（渐进加载入口）

不记录：
- 长篇设计推理
- 详细排障过程

### `MEMORY.md`
记录可复用经验：
- 根因 -> 修复 -> 预防
- 稳定性策略
- 容易漂移的决策边界

### `NEXT_STEP.md`
- 永远只保留一条“下一步执行指针”。
- 会话结束时必须可直接执行。

### `.plan/*.md`
- 存阶段设计、评审、实施记录、检查清单。
- 作为审计与复盘依据，不替代 `PROGRESS` 的状态职责。

## 6. PRD / Plan / Checklist Convention
命名规范：
- 设计文档：`.plan/{YYYYMMDD}_{feature_name}.md`
- 检查清单：`.plan/checklist_{feature_name}.md`

PRD/Design 必备章节：
- Problem Statement
- Boundary & Ownership
- Options & Tradeoffs
- Migration Plan
- Test Strategy

Checklist 执行规则：
- 每项必须可验证。
- 状态只允许 `[ ]` 或 `[x]`。
- 至少包含：实现项、证据项、质量门禁项。

## 7. Change Control Rules
- 范围冻结：阶段内发现新需求，默认进入下一阶段 backlog。
- 兼容优先：新能力默认开关关闭，不影响旧路径。
- 先确定性后智能化：先验证 pinned/固定路径，再优化检索/排序/策略。
- 禁止“看起来完成”：必须通过 AC 和证据工件验证。

## 8. Quality Gates
执行交付前至少通过：
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`

如失败：
- 不得宣称完成
- 必须给出失败点与修复计划

## 9. Definition of Done
仅当以下条件同时满足才算完成：
- 需求与阶段 AC 满足
- 质量门禁通过
- 关键风险与兼容性说明清晰
- `PROGRESS/MEMORY/NEXT_STEP` 已同步
- checklist 状态与证据一致

## 10. Handoff Format
每次交付输出应包含：
- 这轮完成了什么（按阶段）
- 证据在哪里（文件路径/日志字段）
- 还剩什么（下一阶段 P0-NEXT）
- 下一步建议（1-3 条可执行动作）

## 附录: 快速检查表

每次编码前：
```
□ 读取 PROGRESS.md 对齐当前目标
□ 读取 MEMORY.md 检查已知陷阱
□ 确认加载范围 (Fast Path vs Design Path)
```

每次编码后：
```
□ 质量红线检查 (800/50/3/3)
□ 文档-代码同步检查
□ 上下文文件更新
```
