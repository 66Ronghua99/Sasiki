# Replay + Online Refinement Parallel Tracks (Slice-1)

## Goal
- 在不改变已冻结 contract 的前提下，按模块并行实现 Slice-1。
- 流程固定：`worker 开发 -> reviewer 审查 -> lead 合并`。

## Worktree Decision
- 本轮不额外创建 git worktree。
- 使用 subagent 的 forked workspace 并行开发，主代理负责最终集成与冲突处理。

## Track Ownership
### Track-A: MCP Hook + Snapshot Capture
- Owner: `worker-a`
- Scope:
  - `apps/agent-runtime/src/core/mcp-tool-bridge.ts`
  - `apps/agent-runtime/src/domain/refinement-session.ts`（hook/snapshot contracts）
- Deliverables:
  - pre/post hook 接口
  - mutation tool 触发白名单与防递归保护
  - tool return 外层兼容（`content/details` 保持不变）

### Track-B: Artifacts + Index
- Owner: `worker-b`
- Scope:
  - `apps/agent-runtime/src/runtime/artifacts-writer.ts`
  - `apps/agent-runtime/src/domain/refinement-knowledge.ts`
- Deliverables:
  - `refinement_steps.jsonl`
  - `snapshot_index.jsonl`
  - `refinement_knowledge.jsonl`（总是创建，可为空）

### Track-C: Knowledge Store + Bundle Compile
- Owner: `worker-c`
- Scope:
  - `apps/agent-runtime/src/runtime/replay-refinement/refinement-memory-store.ts`
  - `apps/agent-runtime/src/runtime/replay-refinement/core-consumption-filter.ts`
- Deliverables:
  - `surfaceKey/taskKey` 索引检索
  - `knowledgeId` upsert 与排序
  - `consumption_bundle.json`（含 `tokenEstimate/estimatorVersion`）

### Track-D: Orchestrator + HITL Loop
- Owner: `worker-d`
- Scope:
  - `apps/agent-runtime/src/runtime/replay-refinement/online-refinement-orchestrator.ts`
  - `apps/agent-runtime/src/runtime/replay-refinement/refinement-hitl-loop.ts`
  - `apps/agent-runtime/src/runtime/replay-refinement/browser-operator-gateway.ts`
- Deliverables:
  - `evaluate -> critic -> finalize` 状态机壳
  - HITL `pauseId/resumeMode` payload
  - 产生日志事件 `refinement_knowledge_loaded.v0`

### Track-E: Runtime Wiring
- Owner: `lead`（主代理）
- Scope:
  - `apps/agent-runtime/src/runtime/runtime-config.ts`
  - `apps/agent-runtime/src/runtime/workflow-runtime.ts`
  - `apps/agent-runtime/src/runtime/run-executor.ts`（仅必要 adapter）
- Deliverables:
  - `refinement.enabled` 开关接线
  - 兼容 `refinement.enabled=false` 行为不变

## Reviewer Assignment
- `reviewer-a` 检查 Track-A + Track-B
- `reviewer-b` 检查 Track-C + Track-D
- `reviewer-c` 做集成回归与 contract 一致性检查

## Merge Order
1. Track-A + Track-B
2. Track-C
3. Track-D
4. Track-E（最终接线）
5. reviewers 全量通过后执行 typecheck/build
