# Runtime SOP Decoupling Refactor (2026-03-05)

## 1) Problem Statement
- `runtime/sop-compact.ts` 同时承担 rule 压缩、semantic 调用、markdown 渲染、runtime.log 追加和文件落盘，职责过多。
- `core/sop-demonstration-recorder.ts` 同时承担 raw->trace 映射和 trace->guide/hints/tags 生成，难以独立测试。
- 目标：在不改变 CLI 输入输出和 artifacts 结构的前提下，降低模块耦合并提升后续迭代可维护性。
- 非目标：本次不修改语义算法策略、不修改 trace/schema、不引入新功能开关。

## 2) Boundary & Ownership
- `runtime/sop-rule-compact-builder.ts`
  - 负责 rule-based 压缩（纯逻辑）。
  - 输入 `SopTrace`，输出 `BuiltCompact`。
- `runtime/sop-semantic-runner.ts`
  - 负责 semantic 调用与结果归一化（纯调用 + 结果对象）。
  - 不负责文件写入。
- `runtime/sop-compact-renderer.ts`
  - 负责 `sop_compact.md` 文本渲染。
- `runtime/sop-compact.ts`
  - 只负责编排：读 trace、调用 builder/runner/renderer、落盘 artifacts 和 runtime.log。
- `core/sop-trace-builder.ts`
  - 负责 raw events 到 `SopTrace` 的映射与校验。
- `core/sop-trace-guide-builder.ts`
  - 负责从 `SopTrace` 生成 draft/hints/tags。
- `core/sop-demonstration-recorder.ts`
  - 只作为 façade，组合两个 builder。

## 3) Options & Tradeoffs
- Option A（采用）：按职责拆分为小组件，保持服务层编排。
  - 优点：低风险、行为可保持、可逐步测试。
  - 缺点：文件数量增加，短期导航成本上升。
- Option B（拒绝）：一次性引入 application/use-case 层并重写调用链。
  - 优点：理论分层更彻底。
  - 拒绝原因：改动面过大，回归风险高，不符合“功能不变”目标。

## 4) Migration Plan
1. 抽出 rule 压缩 builder，并将序列化 hint 逻辑外提。
2. 抽出 semantic runner，将模型调用结果标准化。
3. 抽出 markdown renderer，统一 compact 文本拼装。
4. 将 `SopCompactService` 收口为编排壳，保留原输出字段与 runtime.log 事件名。
5. 拆 `SopDemonstrationRecorder` 为 trace builder + guide builder façade。
6. 回归验证：`typecheck/build` 必须通过。

回滚点：
- 可直接回滚 `runtime/sop-compact.ts` 与 `core/sop-demonstration-recorder.ts` 到拆分前版本，不影响外部 CLI 契约。

## 5) Test Strategy
- 静态门禁：
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`
- 行为验收：
  - `sop-compact --run-id` 输出仍包含：`sop_compact.md`、可选 `guide_semantic.md`、一致的 `semanticMode/semanticFallback` 字段。
  - observe 链路输出仍包含：`demonstration_raw.jsonl`、`demonstration_trace.json`、`sop_draft.md`、`sop_asset.json`。
