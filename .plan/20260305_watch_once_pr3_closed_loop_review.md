# Watch-Once PR-3 Closed-Loop Technical Plan (Approved, 2026-03-05)

## Review Decision
- Status: Approved
- Approved on: 2026-03-05
- Decision:
  - Gate-1 通过，允许进入 PR-3 Phase-1 编码。
  - Gate-2 条件为 AC-1 ~ AC-4 全通过后再进入 Phase-2（LLM 语义增强）。
  - Phase-1 继续保持范围冻结：不接入 LLM，不接入 run 消费路径。

## Execution Result (Phase-1)
- Status: Passed
- Verified on: 2026-03-05
- Verification sample:
  - `run_id=20260305_134516_980`
- AC results:
  - AC-1 Pass: 输入链仅保留最终有效值（`咖啡豆`），去除中间噪声输入步骤。
  - AC-2 Pass: 连续滚动压缩为单条摘要（如“滚动页面 2 次”）。
  - AC-3 Pass: 多 tab 切换可复盘，且 click hint 保留 `selector + textHint`（`春季穿搭`）并去重。
  - AC-4 Pass: `typecheck/build` 通过，且 `sop-compact` 命令可稳定生成产物。

## 1) Requirement Summary
- Background:
  - PR-2.1 已闭环（多 tab 录制 + compact 输出 + hints 基础可用），但 compact 语义质量和 hint 表达仍偏工程化。
- Problem statement:
  - 工程阶段最容易漂移在两点：范围扩张（提前混入 run 消费/LLM）与验收口径不一致（“看起来可读”但无客观阈值）。
- Why now:
  - 用户已明确“先做可闭环的技术方案评审，再进入开发”，目标是先锁定 Phase-1 的可验证闭环。
- Business objective:
  - 以最小改动拿到“可复盘、可验证、可交付”的 PR-3 Phase-1 结果，确保后续 LLM 接入不破坏基线。
- User objective:
  - compact 文档更接近自然语义，且 hints 能表达关键元素（selector + text/role）以支持后续消费。
- Non-goals (this review loop):
  - 不在本闭环内接入 LLM。
  - 不在本闭环内接 run 资产消费路径。

Assumptions:
- A1: 当前以 `sop-compact` 单命令后处理为主，不改变 observe 录制契约。
- A2: 可使用已有 run（如 `20260305_134516_980`）作为回归样本。
- A3: 评审通过后再进入编码，未通过不动实现。

## 2) Minimum Closed Loop Definition

### 2.1 Loop Identity
- Loop name: `PR-3 Phase-1 Rule Upgrade + Hint Quality`
- User persona: Runtime maintainer / SOP consumer
- Primary user value: 在不引入 LLM 的条件下，获得更可读的 compact 与更可用的 hints
- Single success metric:
  - 输入阶段噪声被融合为“每个目标保留最终输入意图”；
  - 滚动事件被融合为“每段滚动最多一条摘要”；
  - 多 tab 场景仍可复盘（显式切 tab）。

### 2.2 Scope Boundaries
- In scope:
  - `sop-compact` 规则降噪（导航/输入/滚动去冗余）
  - hints 保留 selector/text/role 并去重
  - 验收脚本与证据固化
- Out of scope:
  - LLM 语义增强
  - run 资产消费接线
  - trace schema 破坏性变更
- External dependencies (max 2):
  - `observe` 产物链路稳定可读（raw/trace/asset）
  - `npm --prefix apps/agent-runtime run typecheck && build` 可执行

### 2.3 Loop Flow (max 3 core steps)
1. Trigger:
   - 输入已录制 run_id，执行 `sop-compact`（规则模式）。
2. User action:
   - 对比 trace 与 compact，核对 tab 切换、步骤压缩、hints 表达。
3. System response:
   - 输出 `sop_compact.md`，并可从 `sop_asset.json` 中追踪高质量 hints。

### 2.4 Evidence and Verification
- Observable evidence:
  - `demonstration_trace.json`、`sop_compact.md`、`sop_asset.json`、`runtime.log`
- Data/log source:
  - `artifacts/e2e/{run_id}/`
- Validation method:
  - 指标核验 + 人工复盘（固定 checklist）
- Pass threshold:
  - P1: 输入融合正确：同一 `tabId + target` 的连续输入链在 compact 中仅保留最终有效输入，不保留中间噪声字符。
  - P2: 滚动压缩正确：同一 tab、同一动作段内的连续 scroll 在 compact 中最多 1 条摘要。
  - P3: 多 tab 可复盘：`singleTabOnly=false` 时，compact 必须保留显式“切换到 tab-*”步骤。
  - P4: hint 保真且去重：至少 1 条 click hint 同时含 `selector + textHint`（如“春季穿搭”），且无重复三元组（`selector+textHint+roleHint`）。
  - P5: typecheck/build 通过。
- Monitoring metric (non-blocking):
  - M1: `compactSteps / traceSteps` 作为趋势指标记录，目标区间 `<= 0.70`，仅用于观测不作为硬门槛。
- Fail threshold:
  - 任一 P1-P5 不满足即 fail，不进入 Phase-2

### 2.5 Failure Modes and Guardrails
- Known failure mode 1:
  - 规则压缩过度，丢失关键动作（例如 tab 切换或提交动作）。
- Known failure mode 2:
  - hints 去重策略错误，导致关键文本丢失。
- Recovery or rollback action:
  - 回退到 PR-2.1 规则实现；仅保留已有 `sop-compact` 输出行为。

### 2.6 Delivery Checklist
- [ ] Flow can run end-to-end
- [ ] Evidence can be produced repeatedly
- [ ] Acceptance criteria are testable
- [ ] Deferred items are recorded

## 3) Verification Plan

### 3.1 Acceptance Matrix
| ID | Scenario | Input | Expected Output | Evidence |
| --- | --- | --- | --- | --- |
| AC-1 | 输入融合正确性 | 含拼音输入纠错链（如 `ka fei dao` -> `ka fei dou` -> `咖啡豆`）的 run | compact 仅保留最终有效输入（如“咖啡豆”），中间字符编辑不单独成步骤 | `trace` + `sop_compact` |
| AC-2 | 滚动压缩正确性 | 含连续 scroll 事件的 run | 同一动作段连续 scroll 在 compact 中最多 1 条摘要（如“滚动页面 N 次”） | `trace` + `sop_compact` |
| AC-3 | 多 tab 复盘与 hint 保真 | `singleTabOnly=false` 且含文本点击（如“春季穿搭”）的 run | compact 含切 tab 步骤；`sop_asset` 保留 click 的 `selector + textHint` 且去重 | `sop_compact` + `sop_asset` |
| AC-4 | 工程回归门禁 | 当前分支 | typecheck/build 通过，且 compact 命令可生成产物 | 命令输出 + `runtime.log` |

### 3.2 Anti-Drift Controls
- Scope freeze:
  - 本轮只允许改动 `sop-compact` 与 hints 生成相关模块，不引入 run 消费或 LLM。
- Requirement traceability:
  - 每条 AC 必须映射到代码改动点和证据文件，缺一不可。
- Review gates:
  - Gate-1 方案评审通过后才能编码。
  - Gate-2 AC-1~AC-4 全通过后才能进入 Phase-2。
- Change control:
  - 新需求若超出 in-scope，写入 deferred backlog，不在本轮实现。

## 4) Next Iteration Plan

### 4.1 Latest Loop Result
- Loop name: `PR-2.1 Compact + Multi-Tab`
- Result status: `pass`
- Key evidence:
  - `singleTabOnly=false`，compact 含切 tab，高层步骤可复盘
- Main blocker:
  - hints 语义表达与 compact 可读性仍可提升

### 4.2 Backlog Candidates
| Item | User Impact (1-5) | Confidence (1-5) | Effort (1-5) | Score ((Impact * Confidence) / Effort) |
| --- | --- | --- | --- | --- |
| Phase-1: Rule compact + hints 去重/保留 text | 5 | 5 | 2 | 12.5 |
| Phase-2: Optional LLM 语义增强（可回退） | 5 | 3 | 4 | 3.75 |
| Phase-3: run 资产消费接线 | 4 | 3 | 4 | 3.0 |

### 4.3 Decision
- Keep: `Phase-1` 作为唯一当前闭环
- Add: 评审门禁与 AC 硬阈值
- Cut: 在 Phase-1 混入 LLM/run 消费的诉求

### 4.4 Next 1-3 Actions
1. Action: 评审并冻结本闭环文档与 AC 阈值  
- Owner: PM + 工程负责人  
- Dependency: 当前 run 证据包可访问  
- Done condition: 本文档状态改为 Approved，TODO 固定到 Phase-1

2. Action: 实施 Phase-1 代码改动（rule compact + hints）  
- Owner: Runtime 工程  
- Dependency: Action-1 已通过  
- Done condition: AC-1~AC-4 全通过

3. Action: 输出 Phase-1 验收报告与 deferred backlog  
- Owner: Runtime 工程  
- Dependency: Action-2 已完成  
- Done condition: 产出证据清单、失败复盘、Phase-2 输入条件

### 4.5 Iteration Risk Check
- Any hard dependency at risk:
  - 无新增外部依赖；主要风险在规则改动回归
- Any acceptance criterion still untestable:
  - 当前 AC 全可测
- Any scope creep signal:
  - 若出现“顺手接 LLM/run”的需求，按变更控制延后
