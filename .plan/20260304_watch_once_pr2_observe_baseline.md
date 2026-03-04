# Watch-Once PR-2 Observe Baseline (2026-03-04)

## 1. Problem Statement
PR-1 已冻结 `trace/asset/error` 契约，但仍缺少 `observe` 端到端链路：CLI 无模式切换、runtime 无示教路径、浏览器无事件采集、无法生成示教工件。

Constraints:
- `run` 模式必须保持向后兼容。
- V0 仅支持单标签页。
- 输出必须覆盖 `demonstration_raw/trace/draft/asset` 四类工件。

Non-goals:
- 本 PR 不实现多标签回放。
- 本 PR 不做脱敏与 retention 策略。

## 2. Boundary & Ownership
- `src/index.ts`
  - 负责 `--mode run|observe` CLI 入口切换。
- `src/runtime/agent-runtime.ts`
  - 负责 `observe` 主流程编排、超时/中断收敛、工件落盘与日志。
- `src/infrastructure/browser/playwright-demonstration-recorder.ts`
  - 负责基于 CDP 的真实用户事件采集。
- `src/core/sop-demonstration-recorder.ts`
  - 负责 raw -> trace/draft/hints 归一化。
- `src/runtime/sop-asset-store.ts`
  - 负责 `~/.sasiki/sop_assets/index.json` upsert/search/getById。

## 3. Options & Tradeoffs
Option A: observe 复用现有 AgentLoop 工具执行轨迹
- Pros: 无需额外浏览器事件注入。
- Cons: 采集的是 agent 行为，不是用户真实示教。
- Rejected.

Option B: CDP + 页面事件监听脚本采集真实用户交互（chosen）
- Pros: 直接获得 click/input/keydown/scroll 导致的真实轨迹。
- Cons: 依赖浏览器上下文稳定性，脚本注入需处理导航竞态。

Option C: 全量 DevTools Protocol 低层事件采集
- Pros: 采样更全面。
- Cons: 实现复杂度高，V0 超出范围。
- Rejected.

## 4. Migration Plan
1. 在 CLI 增加 `--mode` 并接入 `runtime.observe(taskHint)`。
2. 在 `AgentRuntime` 新增 observe 主链路，并将 loop 初始化改为 run-only。
3. 新增 Playwright recorder，完成单标签事件捕获与多标签告警。
4. 新增 SOP normalizer，构建 trace/draft/hints 并执行 schema 校验。
5. 新增 asset store，observe 完成后 upsert 索引。
6. 更新 README/PROGRESS/NEXT_STEP 与执行清单。

Rollback points:
- 关闭 CLI `observe` 路径后可立即回到 `run` 旧行为。
- 删除新增 recorder/normalizer/store 不影响 `run` 主链路。

## 5. Test Strategy
- Static gate:
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`

Manual acceptance (Baidu):
1. 运行 `npm --prefix apps/agent-runtime run dev -- --mode observe "..."`。
2. 在浏览器中演示“搜索并打开结果”。
3. 到超时或中断后检查 `artifacts/e2e/{run_id}/` 是否含 4 类示教工件。
4. 检查 `~/.sasiki/sop_assets/index.json` 是否新增对应 `sop_asset`。
