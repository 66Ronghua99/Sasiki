# Architecture Overview

## System Goal

Provide a browser-agent runtime that can learn from observed demonstrations, execute tasks in a live browser, and improve future executions through refinement knowledge with auditable provenance.

## Current Code-Backed Boundaries

- CLI surface:
  - `runtime` (`run` / `observe`)
  - `sop-compact`
- Command routing:
  - `apps/agent-runtime/src/runtime/command-router.ts` owns argv parsing and archived-command rejection
- Runtime composition root:
  - `apps/agent-runtime/src/runtime/runtime-composition-root.ts` owns browser, MCP, prompt, context, and executor assembly
- Runtime providers:
  - `prompt-provider.ts` resolves system prompts
  - `tool-surface-provider.ts` selects raw MCP vs refine-react tool surface
  - `execution-context-provider.ts` prepares SOP consumption and refinement knowledge/resume context
  - `runtime-bootstrap-provider.ts` owns config/env normalization
  - `legacy-run-bootstrap-provider.ts` prepares legacy run bootstrap state before execution
  - `refine-run-bootstrap-provider.ts` prepares resume/pre-observation/guidance prompt inputs before refine execution
- Observe pipeline:
  - demonstration recording and trace generation for watch-once input
- Compact pipeline:
  - interactive multi-round compact session that writes `compact_capability_output`
- Run pipeline:
  - legacy direct execution path through `RunExecutor`
- Refinement pipeline:
  - ReAct refinement path through `ReactRefinementRunExecutor`
  - composite agent-facing tool surface through `RefineReactToolClient`
- Shared execution kernel:
  - legacy run: `AgentLoop + McpToolBridge + Playwright MCP`
  - refinement: `AgentLoop + RefineReactToolClient + Playwright MCP`

## Invariants

- The shared execution kernel is the only browser execution path; higher-level brains and orchestrators must not bypass it.
- Concrete MCP wiring is owned by the composition root, not by CLI parsing or legacy runtime constructors.
- Runtime claims require fresh evidence in `artifacts/e2e/<run_id>/`.
- Refinement knowledge must include provenance (`runId`, step identity, snapshot evidence) before it can be reused.
- Refinement completion requires explicit `run.finish`; if missing, run is not treated as success.
- HITL pause is explicit (`paused_hitl`) and resumable via the same run id.
- Historical `.plan/*` files are background references until a new active architecture spec explicitly supersedes them.
- Documentation and active plans must stay aligned with the implementation baseline; when architecture changes, docs update first.

## Related Docs

- `docs/architecture/layers.md`
- `docs/testing/strategy.md`
- `docs/project/current-state.md`
- `docs/project/README.md`
- `.plan/20260312_replay_refinement_online_design.md` (historical background)
- `.plan/20260313_execution_kernel_refine_core_rollout.md` (historical background)
