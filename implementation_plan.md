# implementation_plan (2026-03-03)

## 1. 项目状态快照

| 模块 | 状态 | 代码证据 |
|---|---|---|
| Phase 1 录制链路 | 已完成，协议持续演进 | `src/sasiki/server/websocket_protocol.py`, `tests/test_phase1_websocket_flow.py` |
| Phase 2 生成链路 | 已完成（structured packet + semantic plan） | `src/sasiki/workflow/recording_parser.py`, `src/sasiki/workflow/skill_generator.py` |
| Phase 3 执行引擎 | 已完成（Refiner/Retry/HITL/Observation） | `src/sasiki/engine/workflow_refiner.py`, `src/sasiki/engine/stage_executor.py` |
| 录制->语义契约文档 | 已完成并可开发 | `docs/BROWSER_RECORDING_SEMANTIC_FLOW_REQUIREMENTS.md`, `docs/BROWSER_RECORDING_SEMANTIC_FLOW_IMPLEMENTATION_SPEC.md` |
| Canonicalizer 实现 | 未开始 | `src/sasiki/workflow/` 下暂无 canonical* 文件 |
| Generate fail-fast validator | 未开始 | `src/sasiki/commands/generate.py`, `src/sasiki/workflow/skill_generator.py` 无 schema gate |

## 2. 未完成 TODO 盘点

### 2.1 来自 `PROGRESS.md` 的 `[ ]`

1. 设计 Agent Prompt Cache 与 Message History 机制。
2. 在真实复杂网站（如小红书）验证执行稳定性与准确率。

### 2.2 来自 `NEXT_STEP.md` 的当前主线

1. Phase A（P0）：`canonical_models.py`。
2. Phase A（P0）：`canonicalizer.py`（deterministic，R1-R6）。
3. Phase A（P0）：`generate` 链路接入 schema validator（fail-fast）。

### 2.3 一致性判断

`PROGRESS.md` 的复选框与 `当前优先级/NEXT_STEP` 存在时序不一致。按最新执行指针，应优先推进 Phase A 的 canonical 基线，否则后续 E2E 与 Prompt Cache 优化都缺少稳定语义输入。

## 3. 推荐最小可执行 TODO

**TODO: Phase A-P0-1（一个 session 内完成）**  
落地 Canonical 基线闭环：
1. 新增 `canonical_models.py`（SSOT 数据模型）。
2. 新增 `canonicalizer.py`（R1-R6 + confidence + diagnostics）。
3. 在 `generate` 中加入 schema validator fail-fast（不合格输入直接终止，不进入 LLM）。

### 选择理由

1. 依赖已就绪：Parser 已输出稳定 structured packet，可直接作为 canonicalizer 输入。
2. 阻塞面最大：这是 `Raw -> Canonical -> Semantic` 的唯一缺口，未补齐将阻塞后续语义稳定性与可追溯性。
3. 可控范围：核心改动集中在 `workflow/` 与 `generate` 链路，风险边界清晰，可通过单元测试封装。

### 工作量估算

- 核心实现：1.5h-2h
- 单元测试：0.5h-1h
- 合计：2h-3h

## 4. 问题定义（Design Path）

### 4.1 当前痛点

1. 生成阶段仍直接喂 Raw action packet 给 LLM，缺少 deterministic 的语义归一层。
2. 没有 schema gate，脏录制数据会直接进入 LLM，导致输出波动与追溯断裂。
3. `reference_actions` 尚未绑定 `source_canonical_action_id`，后续 Refiner traceability 难以闭环。

### 4.2 约束

1. 不破坏现有 CLI 和历史 workflow 的可运行性。
2. Canonicalizer 不允许使用 LLM。
3. 先落地最小闭环，再做协议扩展（submit 显式事件、value_before/value_after 等）。

### 4.3 非目标（本 TODO 不做）

1. 不改 Extension 录制协议（Phase B）。
2. 不改 Refiner trace 字段（Phase D）。
3. 不处理 Prompt Cache 体系。

## 5. 边界与归属

| 组件 | 职责 | 输入 | 输出 |
|---|---|---|---|
| `RecordingParser` | JSONL -> structured raw packet | recording JSONL | raw actions packet |
| `Canonicalizer`（新增） | Raw -> Canonical 归一（deterministic） | raw actions | canonical actions + diagnostics |
| `SkillGenerator` | Canonical -> SemanticStage | canonical actions | workflow payload |
| `generate` 命令 | 入口编排与 fail-fast | recording path | workflow / 错误退出 |

依赖方向：`Parser -> Canonicalizer -> SkillGenerator -> Workflow`。  
Source of Truth：CanonicalAction schema 在 `canonical_models.py`。

## 6. 方案对比与取舍

### Option A（推荐）

新增独立 `Canonicalizer` 层，并在 `generate` 前置校验。

- 优点：职责清晰、可测试、符合 RFC 与 implementation spec。
- 缺点：需要改动 `SkillGenerator` 的输入组装逻辑。

### Option B

在 `SkillGenerator` 内部零散加规则，不引入新模块。

- 优点：短期改动少。
- 缺点：规则与 LLM 流程耦合，后续难维护，且无法形成可复用 SSOT。

### Option C

先做复杂站点 E2E，再回补 canonical。

- 优点：短期可见结果。
- 缺点：会在不稳定语义输入上做验证，数据无法用于稳定优化。

结论：选 Option A。

## 7. Proposed Changes

### 7.1 Workflow 层

1. `[NEW]` `src/sasiki/workflow/canonical_models.py`
- `class PostconditionSpec(BaseModel)`
- `class TargetStrategy(BaseModel)`
- `class RetryHint(BaseModel)`
- `class CanonicalAction(BaseModel)`
- `class CanonicalDiagnostics(BaseModel)`

2. `[NEW]` `src/sasiki/workflow/canonicalizer.py`
- `class Canonicalizer`
- `def canonicalize(raw_actions: list[dict[str, Any]]) -> tuple[list[CanonicalAction], CanonicalDiagnostics]`
- 覆盖规则：windowing、R1-R6、confidence、warning/drop 策略。

3. `[MODIFY]` `src/sasiki/workflow/skill_generator.py`
- `_extract_workflow_data()` 中把 `structured_packet["actions"]` 先送入 canonicalizer。
- semantic prompt 输入切换为 canonical action packet（而非 raw packet 直传）。
- stage 组装时引用 canonical action 的稳定字段。

4. `[MODIFY]` `src/sasiki/workflow/recording_parser.py`
- 如有必要，仅补充 canonicalizer 所需的最小 raw 字段投影函数。

### 7.2 CLI/命令层

1. `[MODIFY]` `src/sasiki/commands/generate.py`
- 对 schema validator / canonicalizer 异常做 fail-fast 退出与可读错误提示。

### 7.3 测试

1. `[NEW]` `tests/workflow/test_canonicalizer.py`
- 覆盖 implementation spec 的 R1-R6、merge、confidence、drop/warning。

2. `[MODIFY]` `tests/test_skill_generator.py`
- 验证 generator 使用 canonical 输入后仍能产出有效 workflow。

3. `[NEW]` `tests/commands/test_generate_validator.py`
- 无效录制输入会在 generate 阶段被拦截，不调用 LLM。

4. `[DELETE]` 无。

## 8. 关键设计决策

1. `CanonicalAction` 作为生成阶段唯一语义输入。
- 原因：避免 Raw 字段噪声直接影响 LLM，保证行为可追溯。

2. fail-fast 放在 generate 编排层，而非 LLM 返回后兜底。
- 原因：低成本尽早失败，避免无效 token 消耗。

3. Phase A 先允许协议字段缺失降级（诊断告警），但禁止关键缺失静默通过。
- 原因：兼容历史录制，同时建立明确升级路径。

## 9. 依赖与差距分析

### 9.1 输入契约就绪度

1. 已具备：`type/timestamp/value/url/page_context/target_hint/triggered_by`。
2. 缺失：`event_id/frame_id/value_before/value_after/submit` 显式事件。

### 9.2 输出契约消费方

1. Generator 消费 canonical actions 产出 semantic stages。
2. Refiner 暂时继续消费现有 `WorkflowStage`，source link 字段放到后续 Phase D。

### 9.3 风险

1. 旧测试样例里的 `type` 事件与 spec 的 `fill` 语义差异可能导致规则误判。
2. 历史录制缺字段导致大量 fallback，短期会出现 `LOW_CONFIDENCE_INTENT`。

### 9.4 缓解

1. 在 canonicalizer 中引入显式 alias 映射（`type -> fill`）。
2. 诊断中输出低置信动作比例，作为 Phase B 协议升级量化依据。

## 10. Migration Plan

1. Step 1：落地 canonical models + canonicalizer（不改外部 CLI 参数）。
2. Step 2：generate 接入 validator，默认启用 fail-fast。
3. Step 3：以现有测试录制集回归，收敛 warning 分类。
4. Step 4：再进入 Phase B 协议字段扩展。

回滚点：`SkillGenerator` 保留 raw packet 兼容入口；若 canonical 路径出现严重回归，可临时回切 raw 模式。

## 11. Verification Plan

### 11.1 单元测试场景

| 场景 | 输入 | 预期 |
|---|---|---|
| R1 Explicit Submit | 包含 `submit` event | 产出 `action_type=submit`, confidence=1.0 |
| R2 Fill+Enter | `fill` 后 2s 内 `press Enter` | 产出 fill + submit 对 |
| Fill Merge | 同目标连续 fill | 合并单个 canonical fill，保留 source ids |
| R4 Navigate | navigate + triggered_by=redirect | confidence=0.80 |
| R6 Fallback | 未命中规则 | `intent_category=other`, `needs_review=true` |
| Missing postcondition | 构造失败样例 | action drop + `MISSING_POSTCONDITION` warning |
| Generate fail-fast | 缺关键字段 raw action | CLI 退出码非 0，LLM 不被调用 |

### 11.2 建议执行命令

```bash
uv run pytest -q tests/workflow/test_canonicalizer.py tests/test_skill_generator.py tests/commands/test_generate_validator.py
uv run ruff check src tests
uv run mypy src
uv run pytest -q
```

### 11.3 手动验证

1. 用一个已有录制运行 `sasiki generate <recording> --preview`，确认 canonical 诊断摘要可见。
2. 用缺字段样本运行 `sasiki generate <recording>`，确认被 fail-fast 拦截。
3. 用正常样本运行生成，确认 workflow stages/variables/checkpoints 仍可落盘。

## 12. 需要用户确认

1. Phase A 是否要求一次性实现完整 R1-R6，还是先交付 R1/R4/R6 最小子集再补齐。
2. fail-fast 严格度是否默认“关键字段缺失即失败”，或允许 warning-only 模式通过。
