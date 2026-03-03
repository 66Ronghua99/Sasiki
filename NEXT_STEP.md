# 当前最高优先级任务

**更新日期：2026-03-03**

## 目标

完成从 Phase B 到 Phase C/D 的故障收敛：
1. 修复 generate 产物中的 URL/变量漂移，避免语义偏航；
2. 提升 refine retry 鲁棒性，避免空参数动作硬失败；
3. 补齐 execution trace 追溯字段与记录一致性。

## 当前状态

1. ✅ 后端协议与 parser 首版已完成（commit: `a10e6a4`）。
2. ✅ extension 协议字段首版已对齐（`content.ts` + `background.ts`，pending real sample）。
3. 🟡 Phase C/D P0 代码修复已落地（canonicalizer 去噪 + generator navigate value 补齐 + retry 降级）。
4. ⏳ 需用有头真实 E2E 复验修复有效性（重点看 Stage1 是否稳定 `fill -> submit`）。
5. ⏳ execution trace source-link（Phase D）尚未接入。
6. 复验样本 `343d6933-9df3-4c32-a35d-b6cd333bbcdf` 显示：已消除空 URL 导航崩溃，但 Stage1 仍因 done-verifier 误拒绝失败；暂不改阶段顺序。

## 立即执行（按顺序）

1. **有头 E2E 复验（P0）**
- 目标：验证 P0 修复后，真实站点 Stage1 不再被连续 `navigate` 主导。
- 验收：同样输入下，Stage1 优先出现 `fill/submit`，且无 `navigate + value=null` 硬失败。

2. **Traceability 补齐（P1）**
- 在 `EpisodeEntry` / execution report 增加 `source_canonical_action_id`（可空）与 `source_link_reason`（当可空时必填）。

## Done Criteria

1. 录制 -> generate -> refine 至少 1 条真实样本闭环成功（允许 HITL）。
2. `fill -> submit` 链路重建通过率 >= 90%。
3. 不再出现 `navigate + value=null` 直接失败。
4. execution_report 失败步可追溯（有 `source_canonical_action_id` 或 `source_link_reason`）。

## 执行约束（必须遵守）

1. 真实站点 refine 使用有头浏览器（不要 `--headless`）。
2. 观测模式固定 `--observation-mode browser_use`。

推荐命令模板：

```bash
uv run sasiki refine <workflow_id> -i search_query="春季穿搭 男" --max-steps 30 --observation-mode browser_use
```

问题样本归档：
1. `/Users/cory/.sasiki/workflows/2575f2d7-084e-449c-ac30-794add02329d/execution_report_final.json`

## 相关规格文档

1. `docs/BROWSER_RECORDING_SEMANTIC_FLOW_REQUIREMENTS.md`
2. `docs/BROWSER_RECORDING_SEMANTIC_FLOW_IMPLEMENTATION_SPEC.md`
