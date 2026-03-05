# Watch-Once PR-3 Phase-3 Consumption Wiring Plan (2026-03-05)

## 0. Project Status Snapshot
| Module | Status | Evidence |
| --- | --- | --- |
| PR-1 Contract Foundation | Done | `domain/sop-trace.ts`, `domain/sop-asset.ts`, `runtime-errors.ts` |
| PR-2 Observe Baseline | Done | `observe` mode + `demonstration_*` / `sop_draft.md` / `sop_asset.json` |
| PR-2.1 Compact + Multi-Tab | Done | `sop-compact` + multi-tab trace (`tabId`) |
| PR-3 Phase-1 Rule Compaction | Done | `sop-rule-compact-builder.ts` |
| PR-3 Phase-2 Semantic Layer | Done | `semantic-compactor.ts`, `guide_semantic.md`, fallback logs |
| PR-3 Phase-3 Run Consumption | Not started | `run` path still executes raw task string only |

## 1. Problem Statement
Current pain:
- `observe -> compact` asset chain exists, but `run` path does not consume SOP assets.
- `run` currently sends only user task to `AgentLoop` (`RunExecutor.execute -> loop.run(task)`), with no guide/hints injection.
- Required traceability (`asset_id/guide_source/fallback_used`) for consumption is absent.

Constraints:
- Must keep backward compatibility: no asset should still run normally.
- SOP guidance priority must remain below real-time page observation.
- Failure to load asset/guide must not block run flow.

Non-goals:
- No deterministic replay engine.
- No cross-run learning/ranking model.

## 2. Boundary & Ownership
- `apps/agent-runtime/src/runtime/run-executor.ts`
  - Run start hook for SOP retrieval/injection and consumption logging.
- `apps/agent-runtime/src/runtime/workflow-runtime.ts`
  - Wire asset store and consumption service into run runtime.
- `apps/agent-runtime/src/runtime/sop-asset-store.ts`
  - Reuse `search(site/taskHint/limit)` as retrieval backend.
- `apps/agent-runtime/src/runtime/artifacts-writer.ts`
  - Persist consumption evidence artifact.
- `apps/agent-runtime/src/runtime/runtime-config.ts`
  - Add consumption toggles and limits.
- `apps/agent-runtime/src/index.ts` + `apps/agent-runtime/runtime.config.example.json` + `apps/agent-runtime/README.md`
  - CLI/config/docs exposure.

## 3. Options & Tradeoffs
Option A: Inject full SOP draft directly (minimal implementation)
- Pros: Fastest to land, low refactor risk.
- Cons: Prompt bloat, low precision, weak relevance control.

Option B: Build a bounded consumption context (Chosen)
- Pros: Controls token size; explicit `guide + top hints + source metadata`; easy fallback.
- Cons: Needs new composition logic and artifact schema.

Option C: Skip prompt injection, only log matched assets
- Pros: Very safe.
- Cons: No user value for execution quality; does not satisfy Phase-3 intent.
- Rejected.

## 4. Recommended TODO (P0-NEXT)
Implement **Phase-3 AC-1 minimum closed loop**:
1. Run can retrieve top-N assets by `site/taskHint` heuristic.
2. Run injects bounded SOP context into agent input (guide + hints).
3. Run writes `sop_consumption.json` and runtime log events containing `asset_id/guide_source/fallback_used`.
4. No asset / invalid asset path falls back to raw task without failure.

Reason:
- All prerequisites already ready (PR-1/2/2.1/3-1/3-2 completed).
- This TODO unblocks downstream prompt hardening and E2E success-rate optimization.

## 5. Proposed Changes
### 5.1 Runtime consumption composition
- `[NEW] apps/agent-runtime/src/runtime/sop-consumption-context.ts`
  - Input: `task`, asset candidates, limits.
  - Output:
    - `augmentedTask` (user task + bounded SOP context block)
    - `consumptionRecord` (`selectedAssetId`, `guideSource`, `fallbackUsed`, `candidateCount`, `usedHints`)
  - Responsibilities:
    - Parse site hint from task text/URL (best-effort).
    - Query `SopAssetStore.search({ site?, taskHint, limit })`.
    - Guide source priority: `guide_semantic.md` (if exists beside trace) -> `asset.guidePath` -> none.
    - Hint trimming: dedupe + cap by `hintsLimit`.

### 5.2 Run path integration
- `[MODIFY] apps/agent-runtime/src/runtime/run-executor.ts`
  - Before `loop.run`, call consumption context builder.
  - Send `augmentedTask` into `loop.run`.
  - Log `sop_consumption_selected` or `sop_consumption_fallback`.
- `[MODIFY] apps/agent-runtime/src/runtime/workflow-runtime.ts`
  - Instantiate and inject consumption dependencies into `RunExecutor`.

### 5.3 Observability artifact
- `[NEW] apps/agent-runtime/src/domain/sop-consumption.ts`
  - Typed schema for consumption evidence.
- `[MODIFY] apps/agent-runtime/src/runtime/artifacts-writer.ts`
  - `writeSopConsumption(record)` -> `sop_consumption.json`.

### 5.4 Config & docs
- `[MODIFY] apps/agent-runtime/src/runtime/runtime-config.ts`
  - Add `consumption.enabled`, `consumption.topN`, `consumption.hintsLimit`, `consumption.maxGuideChars`.
- `[MODIFY] apps/agent-runtime/runtime.config.example.json`
  - Add consumption defaults.
- `[MODIFY] apps/agent-runtime/README.md`
  - Explain run-time SOP consumption behavior and debug artifact.

## 6. Key Design Decisions
1. Inject as low-priority guidance text, not system prompt override.
- Why: avoid violating existing agent behavior and reduce regression risk.

2. Retrieval is deterministic heuristic, not embedding ranker.
- Why: Phase-3 targets minimum closed loop; keep deterministic and debuggable.

3. Consumption must be fully traceable and non-blocking.
- Why: aligns with runtime stability goals; failures must degrade gracefully.

## 7. Migration Plan
1. Add typed consumption contract + context builder (no runtime wiring yet).
2. Wire into `RunExecutor` with fallback-safe behavior.
3. Add artifact/log evidence and config flags.
4. Update docs and `PROGRESS` references.
5. Run gates + manual acceptance.

Rollback points:
- Set `consumption.enabled=false` to return to current run behavior.
- Revert `RunExecutor` integration only; observe/compact chain remains unaffected.

## 8. Verification Plan
### 8.1 Static gates
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`

### 8.2 Acceptance matrix
| ID | Scenario | Input | Expected |
| --- | --- | --- | --- |
| AC-1 | Matched asset consumption | `run` task with known site/taskHint | `sop_consumption.json` contains `selectedAssetId`; runtime logs include `guide_source` |
| AC-2 | No asset fallback | unrelated task | run success; `fallbackUsed=true`; no crash |
| AC-3 | Guide missing fallback | matched asset but guide file removed | run success; fallback to task-only or hints-only; record reason |
| AC-4 | Compatibility | normal run without consumption config | behavior unchanged and run artifacts still complete |
| AC-5 | Engineering gates | current branch | typecheck/build pass |

### 8.3 Manual validation steps
1. Run `observe` once to generate/refresh asset.
2. Run `sop-compact --semantic auto` for same `run_id`.
3. Execute `run` with similar task hint.
4. Check `artifacts/e2e/{run_id}/sop_consumption.json` and `runtime.log`.
5. Confirm selected guide source and fallback behavior match expectations.

## 9. Risks
- Prompt inflation degrades decision quality.
- Wrong asset matching may bias actions to unrelated site.
- Historical assets may reference stale paths; must validate file existence before injection.

Mitigation:
- Cap guide/hints length.
- Require optional site match when site can be inferred.
- Strict path existence checks with graceful fallback.
