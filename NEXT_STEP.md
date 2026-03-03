# 当前执行指针

**更新日期：2026-03-03**

## 当前阶段

P0（不切 Phase）：执行鲁棒性收敛。

## 只做这三件事

1. 继续 headed E2E 复验（固定 `--observation-mode browser_use`），确认三类契约错误持续为 0：
   - `navigate requires URL value`
   - `press requires value`
   - `done.evidence` 类型 parse error
2. 进入 P0-B：Stage2 定位策略收敛，重点处理“search_result 页面无有效 note 目标 -> 循环 navigate/scroll/click idx1”。
3. 增加 Stage2 定位失败可观测性：统计 `target_id not found`、`locator timeout`、`explore<->search_result` 往返循环次数，作为后续策略切换触发条件。

详细重规划见：

1. `docs/P0_EXECUTION_REPLAN.md`

## 验收口径（本轮）

1. 3 次有头 E2E 中，`navigate requires URL value` = 0。
2. 3 次有头 E2E 中，`press requires value` = 0。
3. 3 次有头 E2E 中，`done.evidence` 类型 parse error = 0。
4. Stage1 不再因 verifier 误拒绝 `done` 失败。
5. 在 3 次 run 中，至少 2 次可通过 Stage2，或给出可重复复现的单一 Stage2 主阻塞并有明确修补点。

## 约束

1. 真实站点必须有头模式（不要 `--headless`）。
2. 固定 `--observation-mode browser_use`。

## 参考

1. `docs/P0_EXECUTION_REPLAN.md`（第 8-10 节：最新证据与调试闭环）
2. `PROGRESS.md`（`P0-A2 实施进展（2026-03-04）`）
