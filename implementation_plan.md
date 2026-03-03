# implementation_plan (2026-03-03)

## 0. Archived Next-Step Guide (post-review, authoritative)

This section is the handoff pointer after context compaction.

### Primary specs

1. `docs/BROWSER_RECORDING_SEMANTIC_FLOW_REQUIREMENTS.md` (v1.1)
2. `docs/BROWSER_RECORDING_SEMANTIC_FLOW_IMPLEMENTATION_SPEC.md`

### Immediate coding order

1. Add canonical models: `src/sasiki/workflow/canonical_models.py`
2. Add canonicalizer engine: `src/sasiki/workflow/canonicalizer.py`
3. Wire `generate` pipeline to canonicalizer + schema validator
4. Extend trace fields for refiner path: source links from execution step to canonical action

### Non-negotiable implementation constraints

1. Canonicalizer must be deterministic (no LLM in conversion path)
2. Postconditions must be structured objects only
3. `source_canonical_action_id` required on reference-derived execution steps
4. If source link is null, must emit `source_link_reason` enum

### Test minimum (before merge)

1. Canonicalizer unit tests for R1-R6 intent rules + conflict tie-break + confidence fallback
2. Verifier unit tests for `url_contains`, `value_equals`, `count_at_least`, timeout mapping
3. Integration test: recording -> canonical -> semantic stage -> refiner traceability

### Exit gates

1. Phase A exit: schema validator coverage 100% on generate input samples
2. Phase B exit: submit chain reconstruction >= 90% on benchmark set
3. Phase D exit: failed step traceability = 100%

## 1. 项目状态快照

| 模块 | 当前状态 | 证据 |
|---|---|---|
| Phase 1 录制链路 | 完成，持续站点回归 | `PROGRESS.md`、`tests/test_phase1_websocket_flow.py` |
| Phase 2 Skill 生成 | 完成，结构化字段已落地 | `src/sasiki/workflow/skill_generator.py`、`src/sasiki/workflow/models.py` |
| Phase 3 执行引擎核心 | 完成（含 Retry/HITL/StageVerifier/WorldState/ExecutionReport/ExecutionStrategy） | `src/sasiki/engine/stage_executor.py`、`workflow_refiner.py`、`execution_strategy.py` |
| 当前未完成主线 | 3 项未完成，P0 为“统一观测入口 + browser-use snapshot 试点” | `PROGRESS.md:125-127`、`NEXT_STEP.md:51-64` |

## 2. Problem Statement

- 当前痛点：观测链路存在“双观测/双格式”。
  - `StageExecutor` 通过 `BrowserExecutionStrategy.observe()` 获取一次页面状态。
  - `ReplayAgent.step_with_context()` 又直接调用 `AccessibilityObserver.observe()` 再观测一次。
- 结果风险：
  - 同一步 LLM 决策依赖的观测和引擎侧停滞检测观测不一致。
  - recording 侧关键 hint（`class/tag/attrs`）在当前快照中保留不足，影响复杂站点点击稳定性。
- 约束：
  - 必须保持默认行为兼容（browser-first，不破坏现有 CLI 与测试基线）。
  - 需要可灰度开关与回滚点。
- 非目标（本轮不做）：
  - 不实现 Path B 的 API/Hybrid 执行逻辑。
  - 不在本轮完成大规模 Prompt Cache 体系重构。

## 3. Boundary & Ownership

| 边界 | 责任 | Source of Truth |
|---|---|---|
| 观测数据生产 | 统一从 ObservationProvider 输出标准观测 | `src/sasiki/engine/observation_provider.py`（新增） |
| 执行循环调度 | 只消费 provider 输出，不再各自重复观测 | `StageExecutor` + `ReplayAgent` |
| CLI 开关与配置注入 | 仅负责将 provider/schema 选项注入 refiner | `src/sasiki/commands/refine.py` |
| 兼容与回退 | 默认 legacy；试点按开关启用 browser-use schema | `WorkflowRefiner` 初始化路径 |

## 4. 未完成 TODO 评估与选择

| TODO | 依赖就绪度 | 粒度评估 | 阻塞关系 | 结论 |
|---|---|---|---|---|
| 统一观测入口 + browser-use snapshot 试点 | 高（ExecutionStrategy、AccessibilityObserver、现有测试均在） | 可拆成 1 次会话内的最小 PR | 阻塞真实站点稳定性验证与后续 prompt 优化 | 选中 |
| Agent Prompt Cache / Message History | 中（需先稳定观测输入） | 超过 2 小时，需独立设计与指标口径 | 依赖观测口径统一后更稳妥 | 暂不选 |
| 真实复杂网站稳定性验证 | 中（环境与数据依赖高） | 明显超过 2 小时，偏验证项目 | 受观测质量直接影响 | 暂不选 |
| lint 清理（NEXT_STEP P2） | 高 | 小 | 不阻塞主链路 | 作为并行收尾项 |

### 推荐最小可执行 TODO

**TODO-P0-A1：统一观测入口最小闭环（ObservationProvider + schema 开关 + 对比日志 + 单测）**

- 预估工作量：1.5-2 小时。
- 选择理由：
  - 优先级最高（P0），并直接解除 E2E 稳定性验证的核心阻塞。
  - 依赖已具备，不需要先改数据模型或外部接口。
  - 可通过 feature flag 控制风险，默认行为不变。

## 5. 输入/输出契约与差距分析

### 输入契约

- 页面对象：`playwright.async_api.Page`
- 现有观测源：
  - `AccessibilityObserver.observe(page) -> ObservationResult`
  - `BrowserExecutionStrategy.observe(page, context) -> ObservationResult(execution_strategy)`
- 现有消费者：
  - `ReplayAgent`（LLM prompt + target fallback）
  - `StageExecutor`（stagnation、日志）

### 输出契约（目标）

统一返回 `ProviderObservation`，至少包含：

- `snapshot_mode`: `legacy` or `browser_use`
- `dom_hash`
- `summary`
- `llm_payload`（直接用于 prompt）
- `selector_map`（可选，用于执行/定位 debug）
- `debug_stats`（元素数、序列化长度、命中统计）

### 代码差距

- 缺“统一观测抽象层”：目前 observe 逻辑分散在 `execution_strategy.py` 与 `page_observer.py`。
- 缺“单次观测复用路径”：`StageExecutor` 无法将同一份观测传入 `ReplayAgent`。
- 缺“schema 开关注入”：`refine` CLI 暂无观测模式参数。
- 缺“对比日志结构”：当前日志不足以直接比较 old/new snapshot 命中差异。

### 可复用原型

- `tests/engine/test_page_observer.py`：已有 snapshot 与 dom_hash 稳定性测试，可直接扩展。
- `tests/engine/test_execution_strategy.py`：已有 `observe()` 路径测试，可扩展 provider 注入断言。
- `tests/engine/test_replay_agent_retry.py`：已有 observation mock，可验证“复用单次观测”。

### Memory.md 相关约束

- #10：避免压缩树时丢兄弟节点，新的 provider 不能再次引入“只保留第一子分支”。
- #11：SPA 导航后观测要考虑渲染延迟，provider 设计需允许等待策略复用。
- #8：Prompt 成本敏感，观测输出要支持稳定字段与可缓存结构。

## 6. Proposed Changes

### Engine Observation Layer

- `[NEW]` `src/sasiki/engine/observation_provider.py`
  - 新增统一接口与数据模型：
    - `class ObservationProvider(ABC)`
      - `async def observe(self, page: Page, *, mode: str = "legacy") -> ProviderObservation`
    - `class LegacyObservationProvider(ObservationProvider)`
    - `class BrowserUseObservationProvider(ObservationProvider)`
    - `class ProviderObservation(BaseModel)`
- `[MODIFY]` `src/sasiki/engine/execution_strategy.py`
  - `BrowserExecutionStrategy` 支持注入 `observation_provider`。
  - `observe()` 改为委托 provider，并回填 `ObservationResult`（保持接口兼容）。
- `[MODIFY]` `src/sasiki/engine/replay_agent.py`
  - 新增 `step_with_observation(...)` 或在 `step_with_context(...)` 增加 `observation` 参数。
  - 若外部已传观测，则不再内部二次 observe。
- `[MODIFY]` `src/sasiki/engine/stage_executor.py`
  - 每步只调用一次 strategy/provider observe。
  - 将同一 observation 传给 `ReplayAgent` 决策。
  - 增加 old/new schema 对比日志字段输出（元素数、payload 长度、命中率）。

### CLI / Refiner Wiring

- `[MODIFY]` `src/sasiki/commands/refine.py`
  - 增加可选参数：
    - `--observation-mode [legacy|browser_use]`（默认 `legacy`）
    - `--observation-compare-log`（默认关闭）
- `[MODIFY]` `src/sasiki/engine/workflow_refiner.py`
  - 透传 observation mode 到 `StageExecutor` / strategy。

### Tests

- `[NEW]` `tests/engine/test_observation_provider.py`
  - provider 输出 schema、selector_map、debug_stats、dom_hash 稳定性。
- `[MODIFY]` `tests/engine/test_execution_strategy.py`
  - 覆盖 provider 注入与 observe 委托。
- `[MODIFY]` `tests/engine/test_replay_agent_retry.py`
  - 覆盖“外部 observation 传入时不重复 observe”。
- `[MODIFY]` `tests/engine/test_workflow_refiner.py`
  - 覆盖 observation mode 参数透传与单次观测路径。

### 删除项

- `[DELETE]` 无。

## 7. 关键设计决策

1. 决策：在 Engine 层新增 `ObservationProvider`，而不是仅在 `ReplayAgent` 内做适配。
- 原因：StageExecutor 与 ReplayAgent 都消费观测，抽象应放在共同上游，避免再次分叉。

2. 决策：默认 `legacy`，`browser_use` 通过开关试点。
- 原因：保持向后兼容，降低回归风险；试点可快速收集真实站点数据。

3. 决策：保留 `ExecutionStrategy.observe()` 现有返回结构，对外不破坏。
- 原因：减少改动面，先在内部以 provider 实现重用，再逐步演进接口。

需要你确认：
- CLI 参数命名是否采用 `--observation-mode`（推荐）。
- compare log 是否默认开启（建议默认关闭，按需开启）。

## 8. 方案对比（Options & Tradeoffs）

### Option A（推荐）: 新增 ObservationProvider，StageExecutor 单次观测后复用
- 优点：边界清晰、可灰度、便于后续 prompt/cache 优化。
- 缺点：涉及 4-6 个文件联动。

### Option B: 仅修改 ReplayAgent，复用 strategy.observe 结果
- 优点：改动少。
- 缺点：观测职责仍散落在 strategy/agent，schema 演进继续耦合，长期维护成本高。

### Option C: 直接替换当前快照为 browser-use schema（无开关）
- 优点：推进快。
- 缺点：回归风险高，缺少回滚点；不满足“最小 PR + 试点”目标。

## 9. Migration Plan

1. 新增 provider 与数据模型，保持默认 `legacy`，不改现有行为。
2. `BrowserExecutionStrategy.observe()` 接入 provider，但输出保持原接口。
3. `ReplayAgent` 增加“接受外部 observation”入口，`StageExecutor` 改为单次观测复用。
4. `refine` CLI 增加 mode/compare-log 开关并透传。
5. 增加单元测试与回归测试。
6. 小流量手动验证（小红书 workflow）后再决定是否默认切换。

回滚点：
- 若试点异常，直接使用 `--observation-mode legacy`，不影响主流程。

## 10. Verification Plan

### 单元测试

| 场景 | 预期 |
|---|---|
| Provider(legacy) 输出 | 保持现有 dom_hash 与 summary 语义 |
| Provider(browser_use) 输出 | 包含 `idx/role/name/tag/class/attrs/selector_map` |
| StageExecutor 单次观测 | 每步只调用一次 observe，Agent 不再二次 observe |
| Strategy observe 委托 | `BrowserExecutionStrategy.observe` 调用 provider 并兼容旧返回 |
| CLI 参数透传 | `refine --observation-mode browser_use` 可注入到 refiner |

建议执行命令：

```bash
uv run pytest -q tests/engine/test_observation_provider.py tests/engine/test_execution_strategy.py tests/engine/test_replay_agent_retry.py tests/engine/test_workflow_refiner.py
uv run ruff check src tests
uv run mypy src
uv run pytest -q
```

### 手动验证

1. 准备一个已有可运行 workflow（推荐 `60b002bc-a4c5-4695-9496-a1d9c7f4bc94`）。
2. 执行 legacy 基线：`sasiki refine <id> --cdp-url http://localhost:9222 --observation-mode legacy`。
3. 执行试点模式：`sasiki refine <id> --cdp-url http://localhost:9222 --observation-mode browser_use --observation-compare-log`。
4. 对比日志中元素数、payload 长度、命中信息与 stage 成功率。

预期结果：
- 同一步不再出现双观测。
- 试点模式可检索到 class/tag 等关键 hint。
- 在复杂页面点击成功率提升或至少不下降。
