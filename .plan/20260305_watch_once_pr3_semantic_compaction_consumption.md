# Watch-Once PR-3 Semantic Compaction + Consumption (2026-03-05)

## Progress Snapshot
- Phase-1 (Rule Upgrade): Done (2026-03-05)
- Phase-2 (Optional LLM Semantic Layer): Pending
- Phase-3 (Consumption Wiring): Pending

## 1. Problem Statement
PR-2.1 已完成多 tab 可录制和 `sop-compact` 后处理，但当前 compact 仍以规则聚合为主，存在两个痛点：
- 高层步骤仍混入较多底层噪声（重复导航、字符级输入修正、冗余滚动）。
- `webElementHints` 虽然可用，但对“用户实际操作语义”表达不够（例如点击项文本、角色、用途去重）。

Constraints:
- `demonstration_raw` 与 `demonstration_trace` 继续保持高保真，不因压缩策略丢证据。
- `run`/`observe` 兼容性不回归；PR-3 新增能力必须可开关。
- 若引入 LLM，必须可降级回当前 rule-based 输出（不阻塞主链路）。

Non-goals:
- 本 PR 不做全自动确定性回放引擎。
- 本 PR 不做跨 run 的复杂资产排序学习策略。

## 2. Boundary & Ownership
- `src/runtime/sop-compact.ts`
  - 负责 compact pipeline 分层：规则降噪层 + 可选语义增强层。
- `src/core/sop-demonstration-recorder.ts`
  - 负责 hints 生成策略升级（保留 selector/text/role，多来源去重）。
- `src/domain/sop-asset.ts`
  - 负责补充 guide 元数据契约（版本、生成方式、回退来源）。
- `src/runtime/agent-runtime.ts`
  - 负责 observe 后写入增强 guide，并在 run 前接入资产检索/注入上下文。
- `src/runtime/sop-asset-store.ts`
  - 负责按 `site/taskHint/tag` 的检索接口稳定化（供 run 消费）。
- `src/index.ts`
  - 负责 CLI 参数扩展（如 `sop-compact --semantic`、资产检索调试入口）。

## 3. Options & Tradeoffs
Option A: 仅继续 rule-based 强化（不接 LLM）
- Pros: 稳定、可控、可测。
- Cons: 语义上限较低，复杂意图抽象能力有限。

Option B: 直接改为 LLM-only compaction
- Pros: 自然语言质量高，语义聚合能力强。
- Cons: 不稳定、成本波动、失败路径不可控，且难做 deterministic 回归。
- Rejected.

Option C: 分层混合（chosen）
- 规则层先做“可验证降噪与 hint 去重”，再可选 LLM 语义增强；
- LLM 失败自动回退规则输出，保留兼容与可观测性。

## 4. Migration Plan
1. Phase-1（Rule Upgrade, no LLM）
   - 升级 `sop-compact` 规则：
     - 合并冗余导航（同 URL 连续 navigate）
     - 输入行为聚合为“最终有效输入值”
     - 滚动聚合阈值优化（时间窗 + 位移）
   - 升级 hints：
     - selector/text/role 并存，不再“有 selector 就丢 text”
     - 同步骤和跨相邻步骤去重
   - 产出：`sop_compact.md` 语义可读性提升，hint 更贴近真实点击意图。

2. Phase-2（Optional LLM Semantic Layer）
   - 新增 `SemanticCompactor`（可配置开关：off|auto|on）。
   - 输入：规则层 compact + trace 摘要 + 关键 hints。
   - 输出：`guide.md`（自然语言步骤、前置条件、失败兜底）。
   - 回退：LLM 超时/失败时自动落回规则 guide，并在日志记录 `semantic_fallback=true`。

3. Phase-3（Consumption Wiring）
   - run 前根据 `site/taskHint` 检索 top-N 资产。
   - 将 `guide + webElementHints` 注入 agent 上下文（提示优先级低于实时页面观察）。
   - 记录消费证据：`asset_id`, `guide_source`, `fallback_used`。

Rollback points:
- 可单独关闭 `--semantic`，仅保留 PR-2.1 行为。
- 可单独关闭 run 资产注入，不影响 observe/compact 产物链路。

## 5. Test Strategy
Static gates:
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`

Unit tests (新增最小集):
- 规则压缩：重复 navigate/type/scroll 的合并行为。
- hints 去重：selector/text/role 组合去重与保留策略。
- 语义回退：`SemanticCompactor` 失败后回退 rule 输出。

Integration tests:
- `sop-compact --semantic off|auto` 输出结构一致（字段完整）。
- run 路径可加载资产并记录消费日志，不影响无资产场景。

Manual acceptance:
1. 多 tab observe + compact：验证步骤降噪质量与 hints 可读性。
2. 同一 run 开启/关闭 semantic：验证输出差异与回退行为。
3. run 使用已录资产执行：验证“可消费解释 + hints”确实被注入并可追踪。
