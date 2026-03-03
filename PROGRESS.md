# Sasiki - 精简进度看板

**最后更新：2026-03-03**

## 当前主线

Browser-first：`Extension recording -> Parser/Canonical -> Generator -> Refiner (Playwright)`。

## 阶段状态（当前）

| 阶段 | 状态 | 说明 |
|---|---|---|
| Phase 1 录制链路 | ✅ 完成 | Extension + WS + JSONL 落盘已稳定 |
| Phase 2 生成链路 | ✅ 完成 | Parser + SkillGenerator + LLM + CLI 已打通 |
| Phase A Canonical 基线 | ✅ 完成 | Canonical models/canonicalizer + generate fail-fast 已落地 |
| **Phase B 协议补齐** | 🔄 进行中 | **后端 + extension 协议首版已对齐，等待真实录制样本覆盖率与 E2E 验证** |
| Phase 3 执行引擎 | 🟢 进行中 | Refiner/Retry/HITL/Observation 已可用，继续做实站稳定性 |

## 今日里程碑（2026-03-03）

### 1) Phase B-MVP（后端侧）已提交

Commit: `a10e6a4`  
Message: `feat(recording): add phase-b protocol fields (pending test)`

已完成：
1. `ActionType` 扩展：新增 `press`、`submit`。
2. `PageContext` 新增 `frame_id`（按 context 层建模）。
3. `RecordedAction` 新增可选字段：
   - `event_id`
   - `trace_id`
   - `parent_event_id`
   - `value_before`
   - `value_after`
   - `input_masked`
4. `RecordingParser.to_structured_packet()` 已透传上述字段。
5. `value` 缺失时使用 `value_after` 回退（兼容旧链路消费）。
6. `navigate` 丢失 `triggered_by`：soft-check（warning，不中断）。
7. 测试补充：`tests/test_recording_parser.py`。

### 2) 验证结果（本地）

1. `uv run pytest -q tests/test_canonicalizer.py tests/test_skill_generator.py tests/engine/test_workflow_refiner.py` ✅（63 passed）
2. `uv run mypy src` ✅
3. `uv run pytest -q` ✅（220 passed）
4. `uv run ruff check src tests` ❌（历史 lint 债，当前约 190）

### 3) Phase B-MVP（extension 侧）已完成首版对齐（pending real sample）

已完成：
1. `src/sasiki/browser/extension/content.ts`
   - 动作补齐：新增显式 `press`、`submit` 事件（Enter / submit-button click）。
   - 协议补齐：上报 `eventId/traceId/parentEventId/valueBefore/valueAfter/inputMasked/pageContext.frameId`。
   - 因果补齐：`navigate.triggeredBy` 可产出 `submit`，并回链 `parentEventId`。
   - 兼容修复：`scroll_load` 统一映射为 `scroll`。
2. `src/sasiki/browser/extension/background.ts`
   - 统一 payload 补齐兜底：缺失身份/上下文字段时补 `eventId/traceId/sessionId/pageContext.frameId`。
   - `START_RECORDING` 下发 `traceId`，多 tab 维持同一 trace。
   - `webNavigation` 触发来源映射补齐：`direct/click/submit/url_change/redirect`。
3. extension 构建验证：
   - `npm run typecheck` ✅
   - `npm run build` ✅

### 4) Phase C/D（P0）首轮修复已落地（pending headed E2E）

已完成：
1. `src/sasiki/workflow/canonicalizer.py`
   - 新增噪声过滤：`navigate(triggered_by=url_change)` 且紧邻交互事件时可判定为低信号并丢弃。
   - URL 片段提取增强：优先语义查询键（`keyword/query/q/...`），并对双重编码值做解码归一。
2. `src/sasiki/workflow/skill_generator.py`
   - `navigate` 动作在 `action_details/reference_actions` 中补齐 `value=page_url`，避免空 URL 导航提示。
3. `src/sasiki/engine/stage_executor.py`
   - 执行前校验 `navigate` 必须带 URL。
   - retry 用尽且命中“navigate 缺 URL”时，默认降级为 `paused`（无 handler），避免硬失败退出。
4. 回归测试新增：
   - `tests/test_canonicalizer.py`
   - `tests/test_skill_generator.py`
   - `tests/engine/test_workflow_refiner.py`

## 当前优先级（按顺序）

1. **P0-A2 最小工具化闸门**：先消除 `navigate/press/done` 的字段漂移执行失败。
2. **Headed E2E 回归验证**：固定口径 x3，验证三类契约错误清零。
3. **Stage2 定位复验**：契约稳定后再处理 `target_id not found` 与弱语义 link 点击问题。

## P0 收敛进展（2026-03-03 深夜）

已完成最小代价实现（M1-M3）：

1. 生成层：`target_hint` 改为可读短语（避免把 hash/id 直接塞入 stage goal）。
2. 执行层：交互动作禁止 role-only locator（无 name/test_id/element_id 时判定 ambiguous）。
3. Retry：新增等价失败检测，同类失败连续命中时提前终止当前 retry 策略，避免重复循环。
4. 回归：
   - `uv run mypy src` ✅
   - `uv run pytest -q` ✅（229 passed）
   - `uv run ruff check src tests` ❌（历史债务，190 条，非本次新增）

## 重规划说明（2026-03-03）

为避免继续堆叠 case-by-case 补丁，已将问题与策略重整为分层收敛方案：

1. 记录文件：`docs/P0_EXECUTION_REPLAN.md`
2. 关键原则：输入契约严格、执行定位分层、重试策略去重复
3. 阶段顺序不变：仍停留在 P0，未切到下一 Phase

## 最新 E2E Debug 固化（2026-03-03 深夜）

样本：`/Users/cory/.sasiki/workflows/ddb23bb7-6267-4267-a034-fa11cd2b5628/execution_report_final.json`

新增能力：
1. `execution_report` 已写入每 stage 的 `llm_debug_rounds`（每轮 LLM 输入/输出/归一化动作/解析错误）。

本次量化结论：
1. Stage1 成功（2 steps），Stage2 失败（12 steps，max-steps）。
2. 契约类错误仍是主因：
   - `navigate requires URL value`：7 次
   - `press requires value`：2 次
   - parse error：5 次（其中 `done.evidence` 类型不匹配 2 次）
3. 说明当前主阻塞位于执行契约层（字段漂移），不是 recording 首要阻塞。

决策：
1. 先做 P0-A2 最小工具化闸门（动作 schema + 三条兼容映射）。
2. 契约错误清零后，再回到 Stage2 定位与 verifier 问题。

## P0-A2 实施进展（2026-03-04）

已落地（代码层）：
1. `ReplayAgent._normalize_action_data` 新增 `navigate.url -> value` 映射。
2. `ReplayAgent._normalize_action_data` 新增 `navigate.target(URL string) -> value` 映射。
3. `ReplayAgent._normalize_action_data` 新增 `done.evidence(dict/list/other) -> string` 归一化。

测试与校验：
1. `uv run pytest -q tests/engine/test_replay_agent_retry.py` ✅（27 passed）
2. `uv run mypy src` ✅
3. `uv run pytest -q` ✅（235 passed）
4. `uv run ruff check src tests` ❌（历史债务 191 条，非本次引入）

状态判断：
1. P0-A2 已完成“本地契约闸门”实现与单测覆盖。
2. 下一步进入固定口径 headed E2E x3，验证三类契约错误是否在真实站点清零。

## P0-A2 复验结果（2026-03-04）

样本：`/Users/cory/.sasiki/workflows/ddb23bb7-6267-4267-a034-fa11cd2b5628/execution_report_final.json`

固定口径复验（headed + `--observation-mode browser_use`）结果：
1. `navigate requires URL value` = 0
2. `press requires value` = 0
3. `done.evidence` 类型 parse error = 0
4. `llm_debug_rounds` 总 parse_error = 0

结论：
1. P0-A2（最小工具化闸门）在真实站点 run 中已生效，原三类契约错误本轮为 0。
2. 当前主失败已收敛为 `StageVerifier` 误拒绝 `done`（`evidence does not satisfy success criteria`）。
3. 下一步优先级从“契约补洞”切到“补齐 x2 复验 + verifier 对齐”。

## Verifier 对齐进展（2026-03-04）

已落地：
1. `StageVerifier` 支持从 JSON evidence 字符串提取 URL 并按 `URL containing ...` 规则匹配（含 URL decode 与 `keyword` query 匹配）。
2. 新增单测：`tests/engine/test_stage_verifier.py`。

复验结果（同样本，同口径）：
1. Stage1 已从 `done` 误拒绝变为稳定 `SUCCESS`。
2. 三类契约错误继续为 0：
   - `navigate requires URL value` = 0
   - `press requires value` = 0
   - `done.evidence` 类型 parse error = 0
3. 当前主失败为 Stage2 `max_steps`，表现为目标定位与策略循环（已符合下一阶段主线）。

## 执行约束

1. 真实站点回归默认使用**有头浏览器**（不要传 `--headless`）。
2. 观测模式固定：`--observation-mode browser_use`。

推荐命令：

```bash
uv run sasiki refine <workflow_id> \
  -i search_query="春季穿搭 男" \
  --max-steps 30 \
  --observation-mode browser_use
```

## 最新 E2E 结论（2026-03-03 夜间，修复前基线）

样本：`/Users/cory/.sasiki/workflows/2575f2d7-084e-449c-ac30-794add02329d/execution_report_final.json`

1. Stage1 在真实站点执行失败（`status=failed`，`steps_taken=3`），后续 stage 全部 skipped。
2. 执行轨迹表现为连续 `navigate` 修 URL，而非稳定 `fill -> submit` 语义闭环。
3. retry 阶段出现 `navigate` 但 `value=null`，触发硬错误：`Action 'navigate' requires a 'value' (URL)`。
4. 最终失败由用户中断触发：`Aborted by user after: Retry execution failed...`。

结论：
1. Phase B 协议字段对齐已能支撑链路运行。
2. 当前主阻塞已转移到 Phase C/D（生成策略与执行重试鲁棒性）。

## 最新 E2E 复验（2026-03-03 夜间，修复后）

样本：`/Users/cory/.sasiki/workflows/343d6933-9df3-4c32-a35d-b6cd333bbcdf/execution_report_final.json`

1. Stage1 执行到搜索结果页成功，未出现 `navigate + value=null` 崩溃。
2. 失败原因为 `done` 被 StageVerifier 拒绝（`evidence does not satisfy success criteria`）。
3. 当前仍处于 P0 复验阶段：核心关注点保持不变（`fill -> submit` 稳定性 + 无空 URL 导航硬失败）。

## 已知未解决问题

1. 小红书等站点存在风控拦截（如 461），会导致 refine 提前失败，需通过有头模式 + 人工介入排障。
2. `ruff` 历史债务尚未清理（与当前功能改动非直接耦合）。
