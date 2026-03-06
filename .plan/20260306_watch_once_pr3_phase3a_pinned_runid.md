# Watch-Once PR-3 Phase-3A Pinned RunID Consumption (2026-03-06)

## Status Update
- Implementation: Done
- Static gates: `typecheck/build` passed
- Runtime acceptance: Passed (user confirmed V0 closed loop on pinned run id path)

## 1. Problem Statement
Current pain:
- PR-3 Phase-3 auto-retrieval path couples two variables in one loop: retrieval quality and SOP consumption quality.
- When retrieval misses, runs may still succeed by pure instruction following, making SOP effectiveness hard to verify.
- Current run flow requires task text, which blocks deterministic validation of "asset-only guidance".

Constraints:
- Keep backward compatibility for existing `run "task"` and auto retrieval mode.
- Keep non-blocking consumption fallback behavior.
- Preserve current artifacts and runtime logging contract.

Non-goals:
- No ranking/embedding retrieval upgrade in this iteration.
- No changes to observe recording schema.

## 2. Boundary & Ownership
- `apps/agent-runtime/src/index.ts`
  - Add CLI argument `--sop-run-id` and allow run without task when pinned id is provided.
- `apps/agent-runtime/src/domain/agent-types.ts`
  - Add `AgentRunRequest` contract for run invocation.
- `apps/agent-runtime/src/runtime/workflow-runtime.ts`
- `apps/agent-runtime/src/runtime/agent-execution-runtime.ts`
- `apps/agent-runtime/src/runtime/run-executor.ts`
  - Carry pinned run id through runtime and write richer consumption evidence.
- `apps/agent-runtime/src/runtime/sop-consumption-context.ts`
  - Add deterministic pinned resolution path (`run_id -> asset_id`).
  - Guide loading priority: semantic -> compact -> draft.
- `apps/agent-runtime/README.md`
  - Document deterministic run command and evidence fields.

## 3. Options & Tradeoffs
Option A: Keep only auto retrieval
- Pros: no additional interface.
- Cons: cannot isolate retrieval uncertainty from consumption effectiveness.
- Rejected.

Option B: Deterministic pinned run id path + keep auto retrieval (Chosen)
- Pros: reproducible validation; fast debug; backward compatible.
- Cons: adds one CLI/runtime branch and more evidence fields.

Option C: Replace auto retrieval entirely with pinned mode
- Pros: deterministic only.
- Cons: loses general-purpose behavior; user burden too high.
- Rejected.

## 4. Migration Plan
1. Add run request contract with optional `sopRunId`.
2. Wire `--sop-run-id` from CLI to runtime run executor.
3. Add `selectionMode/taskSource/pinnedRunId` into consumption records.
4. Implement pinned path in consumption builder:
   - resolve `assetId = sop_${runId}`
   - if task missing, use `asset.taskHint` as original task
   - inject semantic/compact/draft guide + hints
5. Keep auto retrieval as default fallback path.
6. Update docs and progress references.

Rollback points:
- Do not pass `--sop-run-id`, run behavior remains auto path.
- Set `consumption.enabled=false`, run behavior reverts to raw task mode.

## 5. Test Strategy
Static gates:
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`

Manual acceptance:
- AC-1: pinned hit
  - command: `run --sop-run-id <known_run_id>`
  - expect: `sop_consumption.json` has `selectionMode=pinned`, `injected=true`, `selectedAssetId=sop_<run_id>`
- AC-2: pinned miss
  - command: `run --sop-run-id <unknown_run_id> "fallback task"`
  - expect: `fallbackReason=pinned_asset_not_found`, run still continues with task
- AC-3: pinned no-task
  - command: `run --sop-run-id <known_run_id>`
  - expect: `taskSource=asset_task_hint`
- AC-4: guide priority
  - expect selected `guidePath` prefers `guide_semantic.md`, then `sop_compact.md`, then `sop_draft.md`

Acceptance evidence:
- `artifacts/e2e/{run_id}/sop_consumption.json`
- `artifacts/e2e/{run_id}/runtime.log`
