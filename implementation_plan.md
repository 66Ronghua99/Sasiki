# implementation_plan (2026-03-03)

## 1. 项目状态快照

| 模块 | 当前状态 | 代码证据 | 结论 |
|---|---|---|---|
| Recording 协议与落盘 | 已上线但字段仍是旧版最小集 | `src/sasiki/server/websocket_protocol.py`, `src/sasiki/server/recording_session.py` | 缺少 Phase B 目标字段（`event_id/frame_id/parent_event_id/value_before/value_after` 等） |
| Parser -> Structured Packet | 可用，已支持 `triggered_by` 与 target hints | `src/sasiki/workflow/recording_parser.py` | 仍未输出 Phase B 关键因果字段，Canonicalizer 可用输入不完整 |
| Canonical 基线 | 已完成首版 deterministic 路径 | `src/sasiki/workflow/canonical_models.py`, `src/sasiki/workflow/canonicalizer.py`, `tests/test_canonicalizer.py` | 已具备 fail-fast 与规则 R1-R6，但上游事件信息仍偏弱 |
| Generator | 已切换消费 canonical packet | `src/sasiki/workflow/skill_generator.py`, `tests/test_skill_generator.py` | 主链路已通，下一步瓶颈在录制协议补齐 |
| Refiner Traceability | 有 execution report，但缺 source link 字段 | `src/sasiki/engine/replay_models.py`, `src/sasiki/engine/refiner_state.py` | Phase D 前置接口未补齐 |
| E2E 实站验证 | 可运行但受站点风控干扰 | `docs/E2E_TEST_REPORT.md`, `docs/E2E_CLICK_FAILURE_ANALYSIS.md` | 需要继续，但当前更高优先是先补协议字段 |

## 2. 未完成 TODO 盘点与依赖检查

| TODO | 来源 | 依赖就绪度 | 单次 session 可交付性 |
|---|---|---|---|
| Phase B-1 扩展 recording 协议字段（submit/triggered_by/value_before/value_after/event_id） | `PROGRESS.md` / `NEXT_STEP.md` | 高（模型和 parser 都在本仓） | 高（可拆成后端模型+parser+测试） |
| Phase B-2 parser 输出补齐 canonicalizer 所需字段（frame_id/parent_event_id） | `NEXT_STEP.md` | 高（与 TODO1 同一改动面） | 高（可与 TODO1 合并为一个最小闭环） |
| 实站录制->generate->refine E2E 闭环 | `PROGRESS.md` | 中（依赖网络/风控/人工介入） | 中（更适合作为协议改动后的验收） |
| Prompt Cache / Message History 设计 | `PROGRESS.md` | 中（需跨 agent/stage executor 设计） | 低（偏设计任务，且非当前主阻塞） |

## 3. 推荐最小可执行 TODO

**推荐：Phase B-MVP（后端协议+parser 对齐）**

目标范围：
1. 扩展 `RecordedAction` 数据模型，兼容接收并持久化 Phase B 新字段。
2. 在 `RecordingParser.to_structured_packet()` 中输出 canonicalizer 需要的因果字段与前后值字段。
3. 保持向后兼容：旧录制文件可继续 `generate`。

选择理由：
1. 这是当前优先级第一项，且直接阻塞“fill->submit 语义还原稳定性”。
2. 依赖全在仓内，不依赖真实站点风控，不会被外部环境卡住。
3. 可在一次开发会话内完成代码+单测，风险边界清晰。

预估工作量：1.5h-2h（实现）+ 0.5h（测试）

## 4. 依赖与差距分析

### 4.1 输入契约（当前 vs 目标）

| 字段 | 当前状态 | 目标状态 | 差距 |
|---|---|---|---|
| `event_id` | 无 | Raw Event 稳定主键 | 需新增到 `RecordedAction` + packet |
| `parent_event_id` | 无 | 因果链路 | 需新增到 `RecordedAction` + packet |
| `frame_id` | 无 | 多 frame 归因 | 需新增到 `PageContext` 或 action 级字段并投影 |
| `value_before/value_after` | 无（仅 `value`） | 输入演化可回放 | 需新增并与 `value` 协调 |
| `triggered_by` | 有但仅弱约束 | 按事件类型规范化 | 需加校验策略（至少 soft-check） |
| `submit` 事件 | Canonicalizer支持；协议枚举未包含 | Recording 明确 submit 边界 | 需扩展 `ActionType` |

### 4.2 输出契约

1. `RecordingParser.to_structured_packet()` 产出字段会被 `Canonicalizer` 直接消费。
2. 新字段在当前阶段主要服务 canonical 归一与未来 traceability，对 `Workflow` 对外接口不应造成破坏。

### 4.3 已有原型与可复用测试

1. `tests/test_recording_parser.py` 已有 structured packet 断言，可直接扩展。
2. `tests/test_canonicalizer.py` 已覆盖 submit/fill merge 语义，可新增“带 event identity”的回归断言。
3. `tests/test_skill_generator.py` 已有 fail-fast 用例，可用于验证兼容性未回退。

### 4.4 Memory 风险对齐

1. 已知规则要求“先保事件语义、再做压缩”，所以新增字段必须原样透传，不先做语义推断。
2. 真实站点验证默认有头浏览器，仅作为本任务完成后的验收步骤。

## 5. Proposed Changes

### 5.1 协议模型层

1. `[MODIFY]` `src/sasiki/server/websocket_protocol.py`
- 扩展 `ActionType`：新增 `SUBMIT`（必要时补 `PRESS`，视现网事件是否出现）。
- `RecordedAction` 新增可选字段：`event_id`, `trace_id`, `parent_event_id`, `value_before`, `value_after`, `input_masked`。
- `PageContext` 新增 `frame_id`（或 action 级 `frame_id`，二选一，见设计决策）。
- 保持旧字段不删除，alias 兼容驼峰与下划线。

### 5.2 解析与投影层

1. `[MODIFY]` `src/sasiki/workflow/recording_parser.py`
- `to_structured_packet()` 的 `raw` 与上下文字段补齐：`event_id/parent_event_id/frame_id/value_before/value_after/input_masked`。
- 保留现有 `value` 语义，避免破坏下游；当 `value` 为空时可回退 `value_after`（仅投影层，不改原始落盘）。
- 在 compact narrative 中仅补充必要字段（避免提示词膨胀）。

### 5.3 Canonical 对齐层（最小接入）

1. `[MODIFY]` `src/sasiki/workflow/canonicalizer.py`
- schema 验证允许并读取新增字段（不强制）。
- `source_event_ids` 维持当前类型与行为，新增字段仅用于后续 trace 对齐准备。

### 5.4 测试

1. `[MODIFY]` `tests/test_recording_parser.py`
- 新增“新字段透传到 structured packet”断言。
- 新增“旧录制样本不含新字段仍可解析”回归断言。
2. `[MODIFY]` `tests/test_canonicalizer.py`
- 新增“submit + parent_event_id 场景仍能生成正确 canonical action”断言。
3. `[MODIFY]` `tests/test_skill_generator.py`
- 新增“带新字段录制样本 generate 成功”的兼容性断言。

### 5.5 删除项

1. `[DELETE]` 无。

## 6. 关键设计决策

1. **新字段采用 optional + backward compatible**
- 原因：历史 JSONL 资产较多，直接强制字段会导致 generate 大面积 fail-fast。

2. **`value` 不移除，`value_before/value_after` 作为补充事实字段**
- 原因：下游已有大量 `value` 使用点，先并存可降低回归风险。

3. **`triggered_by` 先做 soft validation（warning）而非 hard fail**
- 原因：现网录制端尚在演进，先用告警统计覆盖率，再在 Phase B 末期升为强校验。

需要你确认：
1. `frame_id` 放在 `PageContext` 还是 `RecordedAction` 顶层（我建议放 `PageContext`，更符合“页面上下文”语义）。
2. `ActionType` 是否立即加入 `PRESS`（如果 extension 会上报键盘事件，建议同时加入，减少后续兼容分支）。

## 7. Verification Plan

### 7.1 单元测试矩阵

| 场景 | 输入 | 预期 |
|---|---|---|
| 新字段透传 | action 含 `event_id/value_before/value_after/frame_id` | packet 中对应字段存在且值一致 |
| submit 兼容 | `type=submit` action | `RecordedAction` 可解析，canonical 可产出 submit intent |
| 旧样本兼容 | 无新字段旧 JSONL | parser/generate 全流程不报 schema 错误 |
| triggered_by soft-check | `navigate` 无 triggered_by | 不中断流程，但产生可观测告警 |
| value 回退 | `value=None`, `value_after=xxx` | structured packet 中 input 语义可被 canonical 消费 |

### 7.2 计划执行命令

```bash
uv run ruff check src tests
uv run mypy src
uv run pytest -q tests/test_recording_parser.py tests/test_canonicalizer.py tests/test_skill_generator.py
uv run pytest -q
```

### 7.3 手动验证

1. 用一条新录制样本执行 `uv run sasiki generate <recording.jsonl> --preview`，确认 structured packet 含新增字段。
2. 执行一次 `generate -> refine` 冒烟，检查 execution report 仍正常落盘。
3. 实站验证遵守有头模式：`uv run sasiki refine <workflow_id> ... --observation-mode browser_use`（不加 `--headless`）。

## 8. 交付边界与下一步

本计划只覆盖 Phase B 的最小后端契约补齐，不包含：
1. extension 端事件生产逻辑改造。
2. Refiner execution trace 的 `source_canonical_action_id/source_link_reason` 全量落地。

完成本 TODO 后，下一步建议直接进入：
1. Phase B-后半：字段覆盖率统计与强校验开关。
2. Phase D 预对齐：Episode/ExecutionReport 增加 source link 字段。
