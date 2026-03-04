# Watch-Once PR-1 Contract Foundation (2026-03-04)

## 1. Problem Statement
Watch-Once v0 的 PRD/交接文档已经冻结了 `trace/asset/error` 契约，但代码层尚未落地，导致 PR-2（observe 端到端）没有稳定可依赖的类型边界与工件写入接口。

Constraints:
- 保持现有 `run` 模式兼容，不改动既有执行主链路。
- 契约必须显式 `v0` 版本化，便于后续演进。
- 先做 Contract Foundation，不提前引入 recorder/observe 复杂行为。

Non-goals:
- 本 PR 不接入 `--mode observe`。
- 本 PR 不实现浏览器示教事件采集。

## 2. Boundary & Ownership
- `src/domain/sop-trace.ts`
  - 负责示教 trace 契约与 schema 校验（唯一真相源）。
- `src/domain/sop-asset.ts`
  - 负责 SOP 资产与检索查询契约（唯一真相源）。
- `src/domain/runtime-errors.ts`
  - 负责 observe/SOP 相关错误码定义与错误对象封装。
- `src/runtime/artifacts-writer.ts`
  - 负责示教工件写入 API（raw/trace/draft/asset）。
- `src/runtime/runtime-config.ts`
  - 负责 observe 基础配置字段与固定 asset 根路径常量。

## 3. Options & Tradeoffs
Option A: 直接在 PR-2 一次性实现合同 + 采集闭环
- Pros: 一次提交，改动集中。
- Cons: 变更面过大，排障边界不清晰。
- Rejected.

Option B: 先做 Contract Foundation，再接 observe wiring（chosen）
- Pros: 清晰分层，PR-2 只处理行为接线，风险更可控。
- Cons: 需要额外一个增量 PR。

Option C: 仅写文档，不落地类型
- Pros: 无代码风险。
- Cons: 无法提供编译期约束，易出现实现漂移。
- Rejected.

## 4. Migration Plan
1. 新增 `sop-trace.ts` 并实现 `validateSopTrace`。
2. 新增 `sop-asset.ts` 与 `runtime-errors.ts`。
3. 扩展 `artifacts-writer.ts`，新增示教工件写入与路径方法。
4. 扩展 `runtime-config.ts`：新增 `observeTimeoutMs` 与固定 `sopAssetRootDir`。
5. 更新 `runtime.config.example.json` 示例字段。
6. 运行 `typecheck/build` 作为交付门禁。

Rollback points:
- 回滚新增 domain 文件与 `artifacts-writer` 新方法，不影响 `run` 主链路。
- 保留旧 config 字段，新增字段可安全移除。

## 5. Test Strategy
- Static gate:
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`

Manual spot checks:
- `ArtifactsWriter` 对空数组写 `*.jsonl` 时输出空文件（无脏 JSON）。
- `validateSopTrace` 对非法 `traceVersion/stepIndex/action/rawRef/timestamp` 抛出 `SOP_TRACE_SCHEMA_INVALID`。
