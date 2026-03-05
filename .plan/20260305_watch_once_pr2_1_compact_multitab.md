# Watch-Once PR-2.1 Compact + Multi-Tab (2026-03-05)

## 1. Problem Statement
PR-2 已具备 observe 基线产物，但在真实录制中出现两类可用性问题：
- 原始 trace 噪声高（字符级 key/input 导致步骤膨胀），不利于后续复盘与消费。
- 录制遇到多标签场景会失败，不符合真实业务流程。

Constraints:
- 录制阶段保持高保真，不丢原始证据。
- 降噪作为独立后处理，不与录制链路耦合。
- 产物仍保留在单次 run 目录下，不新增全局索引字段。

Non-goals:
- 本 PR 不做 variable 抽象。
- 本 PR 不做强制步数阈值压缩。

## 2. Boundary & Ownership
- `src/infrastructure/browser/playwright-demonstration-recorder.ts`
  - 负责多标签事件采集与 `tabId` 标记。
- `src/domain/sop-trace.ts` / `src/core/sop-demonstration-recorder.ts`
  - 负责 tab-aware trace 契约与归一化输出。
- `src/runtime/sop-compact.ts`（new）
  - 负责手动后处理命令：输入 `runId`，输出 `sop_compact.md`。
- `src/index.ts`
  - 负责新增 `sop-compact --run-id` CLI 入口。
- `src/runtime/runtime-config.ts`
  - 负责 artifacts 默认目录统一到仓库根 `artifacts/e2e`。

## 3. Options & Tradeoffs
Option A: 在录制阶段直接做强压缩
- Pros: 产物更干净。
- Cons: 易丢证据，调试困难。
- Rejected.

Option B: 录制保真 + 独立后处理（chosen）
- Pros: 保留证据且可迭代优化压缩策略。
- Cons: 增加一步手动命令。

Option C: 继续单标签失败策略
- Pros: 简化实现。
- Cons: 与真实业务操作不匹配。
- Rejected.

## 4. Migration Plan
1. 录制器改为多标签可采集，所有事件附带 `tabId/openerTabId`。
2. trace step 增加 `tabId`，并按实际采集结果标记 `singleTabOnly`。
3. 新增 `sop-compact` CLI 命令（基于 `runId`）。
4. 生成 `sop_compact.md`（单文件，含 high-level 步骤 + hints + 显式切 tab 步骤）。
5. 统一默认 artifacts 根目录到仓库根路径。
6. 更新 README/PROGRESS/MEMORY/NEXT_STEP。

Rollback points:
- 移除 `sop-compact` 命令不影响 observe/run 主链路。
- 录制器可回退到单标签逻辑。

## 5. Test Strategy
- Static gate:
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`

Manual verification:
1. 运行 observe，执行含多 tab 的操作，确认不再失败。
2. 检查 `demonstration_raw.jsonl` / `demonstration_trace.json` 是否带 `tabId`。
3. 运行 `sop-compact --run-id`，检查 `sop_compact.md` 是否生成并含“切换到 tab-*”步骤。
