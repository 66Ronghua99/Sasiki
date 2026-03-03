# Browser Recording -> Semantic Flow -> Refiner RFC (v1.1)

Status: Draft (Revised after PM review)
Owner: Sasiki Core Team
Last Updated: 2026-03-03
Reviewed Doc: `docs/BROWSER_RECORDING_SEMANTIC_FLOW_REQUIREMENTS_REVIEW.md`

## 1. Problem Statement

当前链路存在以下关键问题：

1. 录制层产出微操作事件流，但语义边界不稳定（典型：`fill` 与 `submit`）。
2. 语义生成阶段缺少可程序化消费的后置条件，导致“可读但不可验证”。
3. 执行阶段缺少稳定追溯链路，难以定位失败到具体事件与动作。

本 RFC 目标是定义一套**单一事实源、可回溯、可优化**的端到端契约。

## 2. Scope and Non-Goals

### 2.1 Scope

1. Raw Event 录制契约。
2. Canonical Action IR 归一化契约。
3. Semantic Stage（Generator 输出）契约。
4. Execution Trace（Refiner 输出）契约。
5. 指标、验收和迁移退出条件。

### 2.2 Non-Goals

1. 不做像素级视频回放。
2. 不在 v1 自动化处理验证码与反爬。
3. 不在 v1 扩展到多浏览器实现（先 Chrome-first）。

## 2.3 Companion Implementation Spec

本 RFC 的实现细节（规则矩阵、优先级、降级策略、测试矩阵）见：

`docs/BROWSER_RECORDING_SEMANTIC_FLOW_IMPLEMENTATION_SPEC.md`

实现阶段以该文档为准，避免不同开发者在 `intent` 与 `postconditions` 上产生隐式分歧。

## 3. Responsibility and Dataflow (C1)

### 3.1 Authoritative Pipeline

```text
[Chrome Extension]
  -> Raw Event (WS ACTION)
  -> [WebSocketServer + RecordingSession] append JSONL
  -> [RecordingParser] parse raw actions
  -> [Canonicalizer (NEW, workflow layer)] build Canonical Actions
  -> [SkillGenerator] generate Semantic Stages
  -> [WorkflowRefiner] execute + verify
  -> Execution Trace / Report
```

### 3.2 Component Ownership

1. Chrome Extension:
采集原始事件，不做语义推断。
2. WebSocketServer / RecordingSession:
协议校验与持久化，不做 Canonical 归一。
3. RecordingParser:
解析 JSONL 为结构化原始动作。
4. Canonicalizer (新增组件，建议路径 `src/sasiki/workflow/canonicalizer.py`):
唯一负责 `Raw Event -> Canonical Action` 转换。
5. SkillGenerator:
消费 Canonical Actions，输出 Semantic Stages。
6. WorkflowRefiner:
消费 Semantic Stages 执行、验证与优化。

### 3.3 Trigger Model

1. `Raw -> Canonical` 为离线触发：由 `generate` 命令触发。
2. 不在录制时实时生成 Canonical（避免 extension 端语义漂移）。

## 4. Data Contracts

## 4.1 Raw Event (Recording SSOT)

Raw Event 只记录事实，不做意图推理。

Required fields:

1. Identity and time:
`event_id`, `session_id`, `trace_id`, `timestamp_wall`, `timestamp_mono`
2. Event semantics:
`event_type` (`click`, `fill`, `press`, `submit`, `navigate`, `scroll`, `tab_switch`, `page_enter`)
3. Context:
`url`, `title`, `frame_id`, `tab_id`, `viewport`
4. Target:
`role`, `name`, `tag_name`, `test_id`, `element_id`, `class_names`, `selector_hint`
5. Input/output:
`value_before`, `value_after`, `input_masked`
6. Causality:
`triggered_by`, `parent_event_id`
7. Evidence:
`screenshot_ref`, `dom_ref`
8. Result:
`result`, `error_code`, `error_message`

### 4.1.1 `triggered_by` Applicability Matrix (M1)

1. `navigate`:
必须有，允许值：`direct`, `click`, `submit`, `url_change`, `redirect`。
2. `submit`:
必须有，允许值：`press_enter`, `click_submit_button`, `programmatic_submit`。
3. `fill`:
可选，允许值：`user_input`, `autofill`, `paste`。
4. `click`:
可选，允许值：`user_click`, `programmatic_click`。
5. 其他事件：
不适用时写 `null`，不允许省略字段。

### 4.1.2 Hard Rules

1. 必须显式区分 `fill` 与 `submit`，禁止仅用 `url_change` 反推提交行为。
2. 所有 `navigate` 事件必须包含 `triggered_by`。
3. 敏感输入必须脱敏。

## 4.2 Canonical Action IR (Generator Input SSOT)

Canonical Action 是语义生成的唯一输入。

Required fields:

1. Identity:
`canonical_action_id`, `source_event_ids`
2. Intent:
`intent_category`, `intent_label`
3. Action:
`action_type`, `target_strategy`, `input`
4. Conditions:
`preconditions`, `postconditions`
5. Recovery:
`retry_hint`
6. Traceability:
`evidence_refs`

### 4.2.1 Intent Governance (C4)

`intent` 拆分为两层：

1. `intent_category`（受控枚举，可程序判断）:
`search`, `open`, `filter`, `interact`, `navigate`, `submit`, `extract`, `assert`, `other`
2. `intent_label`（开放文本，仅用于可读性）:
例如 `open_first_search_result`。

规则：

1. 程序逻辑只消费 `intent_category`。
2. `intent_label` 可由 LLM 生成，但不参与核心判定。

### 4.2.2 Structured `postconditions` Schema (C2)

`postconditions` 必须为结构化对象数组，不允许自然语言裸字符串。

Allowed specs:

```json
{ "type": "url_contains", "value": "keyword=..." }
{ "type": "url_not_contains", "value": "login" }
{ "type": "element_visible", "role": "button", "name": "搜索" }
{ "type": "element_not_visible", "role": "dialog", "name": "加载中" }
{ "type": "text_contains", "role": "heading", "name": "结果", "value": "春季穿搭" }
{ "type": "count_at_least", "role": "listitem", "min_count": 1 }
{ "type": "value_equals", "role": "textbox", "name": "搜索小红书", "value": "春季穿搭 男" }
```

Verifier consumption rule:

1. 每个 action 至少 1 条 postcondition。
2. action 成功判定为：`all(postconditions) == true`。

## 4.3 Semantic Stage (Generator Output Contract)

Semantic Stage 是 Refiner 直接输入。

Required fields:

1. `stage_name`
2. `objective`
3. `success_criteria`
4. `context_hints`
5. `reference_actions`

### 4.3.1 `context_hints` Format (C3)

为兼容当前 `WorkflowStage.context_hints: list[str]`，v1 固定为 `list[str]`，每项使用键值模板：

`kind=<kind>;scope=<scope>;text=<text>`

Allowed `kind`:

`state`, `constraint`, `environment`, `risk`, `strategy`

Examples:

1. `kind=state;scope=session;text=用户已登录，无需登录流程`
2. `kind=constraint;scope=interaction;text=优先 role+name 定位，避免 class-only`

### 4.3.2 `reference_actions` Mapping (M2)

`reference_actions` 采用**内联子集**，并保留源 ID 追溯：

```json
{
  "source_canonical_action_id": "can_002",
  "action_type": "submit",
  "target": {"role": "button", "name": "搜索"},
  "value": null,
  "postconditions": [{"type": "url_contains", "value": "keyword="}]
}
```

规则：

1. 不是仅 ID 引用，避免 Refiner 运行时强依赖 Canonical 存储。
2. 必须包含 `source_canonical_action_id`。

## 4.4 Execution Trace (Refiner Output Contract)

Execution Trace 是回溯和优化评估依据。

Required fields:

1. `workflow_id`, `stage_id`, `step`
2. `source_canonical_action_id` (nullable)
3. `action` (`type`, `target`, `value`)
4. `observation` (`summary`, `dom_hash`, `key_elements`)
5. `url_before`, `url_after`, `page_changed`
6. `result`, `error_type`, `error_message`
7. `verification_evidence`

Rule:

1. 任一步失败必须可追溯：Execution Trace -> Canonical Action -> Raw Event。

## 5. Model Mapping to Current Code (M4)

| RFC Contract | Current Model / File | v1 Strategy |
|---|---|---|
| Raw Event | `RecordedAction` in `src/sasiki/server/websocket_protocol.py` | 扩展字段，不破坏旧字段 |
| Semantic Stage | `WorkflowStage` in `src/sasiki/workflow/models.py` | 复用现有字段（`objective`, `success_criteria`, `context_hints`, `reference_actions`） |
| Agent Action | `AgentDecision` in `src/sasiki/engine/replay_models.py` | 继续消费 `action_type/target/value` |
| Execution Trace step | `EpisodeEntry` in `src/sasiki/engine/replay_models.py` | 新增 `source_canonical_action_id`（可选） |
| Execution report | `ExecutionReport` in `src/sasiki/engine/refiner_state.py` | 逐步补充 traceability 字段 |

Compatibility policy:

1. v1 采用双轨：新字段可选、旧流程可运行。
2. 当 schema validator 覆盖率达标后，再将关键字段升级为强制。

## 6. Generator Adequacy Criteria

录制内容被视为“足够生成语义 flow”，必须同时满足：

1. Action completeness:
每个关键动作有 target + postcondition + source_event_ids。
2. Causality completeness:
关键跳转链路含 `triggered_by` + `parent_event_id`。
3. Verification completeness:
每个 stage 的 success criteria 可映射到结构化 postconditions。
4. Replay completeness:
`reference_actions` 至少覆盖关键语义边界（例如 fill+submit）。

## 7. Refiner Consumption Criteria

action flow 被视为“可被 refiner 消化”，必须同时满足：

1. Contract match:
`action_type/target/value` 在 `AgentDecision` 支持范围内。
2. Verification match:
`success_criteria` 可由 verifier 执行判定。
3. Recovery match:
失败有 `error_type` 分类并可应用 retry 策略。
4. Traceability match:
执行步包含 `source_canonical_action_id` 或明确 `null` 原因。

## 8. Metrics, Baselines, and Denominators (m1)

### 8.1 Metric Definitions

1. Flow generation consistency:
分母 = 同一录制重复生成次数 N（建议 N=5）；
分子 = stage signature 完全一致次数。

2. Stage pass rate:
分母 = 尝试执行的 stage 总数（不含 skipped/manual aborted）；
分子 = status=`success` 且 verified=true 的 stage 数。

3. Failure traceability:
分母 = failed steps 总数；
分子 = 可回溯到 canonical_action_id 且 source_event_ids 非空的 failed steps。

### 8.2 Baseline Collection Rule

1. Baseline 数据源：`docs/E2E_TEST_REPORT.md` 中首批基准集（至少 10 个 workflow run）。
2. Baseline 产出时点：Phase A 退出前必须产出一次。
3. 在 baseline 未落盘前，不允许标记 Phase B 完成。

### 8.3 Target Metrics

1. Flow generation consistency >= 95%
2. Stage pass rate >= 80%
3. Failure traceability = 100%

## 9. Migration Plan and Exit Criteria (m2)

### Phase A: Schema Freeze

Work:

1. 冻结四层 schema。
2. 增加 schema validator。

Exit criteria:

1. validator 覆盖 100% generate 输入样本。
2. review open P0 议题全部关闭。

### Phase B: Recording Upgrade

Work:

1. 增加 submit 显式事件。
2. 完整补齐 triggered_by 规则。

Exit criteria:

1. 新字段覆盖率 >= 90%（基准集）。
2. `fill` 后提交链路可被稳定还原（样本通过率 >= 90%）。

### Phase C: Generator Upgrade

Work:

1. 引入 Canonicalizer。
2. Generator 仅消费 Canonical Actions。

Exit criteria:

1. 所有 reference_actions 含 `source_canonical_action_id`。
2. 每个 stage 至少 1 条结构化 success criteria。

### Phase D: Refiner Alignment

Work:

1. Refiner 补充 traceability 字段。
2. Verifier 消费结构化 postconditions。

Exit criteria:

1. Execution Trace 失败步 100% 可追溯。
2. stage pass rate 达到目标门槛。

### Phase E: Legacy Cleanup

Work:

1. 下线 legacy 双轨字段兼容。

Exit criteria:

1. 连续 2 周 E2E 指标达标。
2. 无 P0/P1 回归缺陷。

## 10. Risks and Mitigations

1. Risk:
字段扩展导致数据体积增长。
Mitigation:
Raw 全量落盘 + 运行态 compact projection。

2. Risk:
LLM 语义波动导致输出不稳定。
Mitigation:
LLM 负责提取，组装由 deterministic assembler 完成。

3. Risk:
优化模式偏离用户意图。
Mitigation:
优化仅允许在 objective/success criteria 等价前提下。

## 11. Open Decisions with Owner and Deadline (m3)

| ID | Decision | Owner | Deadline | Needed Before |
|---|---|---|---|---|
| D1 | `submit` 判定是否允许推断补全 | Product + Engine | 2026-03-05 | Phase B start |
| D2 | `postconditions` 最小枚举是否增加 `network_response` | Engine | 2026-03-06 | Phase C start |
| D3 | 是否引入 `action_cost` 进入 Canonical Action | Product + Engine | 2026-03-07 | Phase D start |

Default policy if deadline missed:

1. D1: 仅接受显式 submit，不做推断。
2. D2: 维持当前最小枚举，不新增类型。
3. D3: 不引入 action_cost。

## Appendix A: Example Raw Event

```json
{
  "event_id": "evt_001",
  "session_id": "sess_abc",
  "trace_id": "trace_abc",
  "timestamp_wall": "2026-03-03T17:00:00Z",
  "timestamp_mono": 1023456,
  "event_type": "fill",
  "url": "https://www.xiaohongshu.com/search_result",
  "title": "小红书搜索",
  "frame_id": "main",
  "target": {
    "role": "textbox",
    "name": "搜索小红书",
    "tag_name": "input",
    "test_id": null,
    "element_id": "search-input",
    "class_names": ["search-input"]
  },
  "value_before": "深信服x-star面试",
  "value_after": "春季穿搭 男",
  "input_masked": false,
  "triggered_by": "user_input",
  "parent_event_id": null,
  "screenshot_ref": "shot_001.png",
  "dom_ref": "dom_001.json",
  "result": "success",
  "error_code": null,
  "error_message": null
}
```

## Appendix B: Example Canonical Action

```json
{
  "canonical_action_id": "can_002",
  "source_event_ids": ["evt_001", "evt_002"],
  "intent_category": "submit",
  "intent_label": "submit_search_query",
  "action_type": "submit",
  "target_strategy": {
    "preferred": {"role": "button", "name": "搜索"},
    "fallbacks": [
      {"type": "press", "value": "Enter"},
      {"type": "selector", "value": "[data-testid='search-submit']"}
    ]
  },
  "input": null,
  "preconditions": [
    {"type": "value_equals", "role": "textbox", "name": "搜索小红书", "value": "春季穿搭 男"}
  ],
  "postconditions": [
    {"type": "url_contains", "value": "keyword="},
    {"type": "count_at_least", "role": "listitem", "min_count": 1}
  ],
  "retry_hint": {
    "max_attempts": 2,
    "fallback_order": ["press_enter", "click_search_button"]
  },
  "evidence_refs": ["shot_002.png", "dom_002.json"]
}
```
