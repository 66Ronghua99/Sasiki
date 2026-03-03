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

1. **Headed E2E 回归验证（下一步）**：用真实录制样本验证 `fill -> submit` 是否稳定替代连续 `navigate`。
2. **Traceability 补齐**：execution trace 增加 `source_canonical_action_id/source_link_reason` 并修复 step 记录连续性。
3. Prompt Cache / Message History 成本优化。

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
