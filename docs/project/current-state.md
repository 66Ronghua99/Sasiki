# Current State

## Restart Status
- Repository baseline has been rolled back to commit `3c97346`.
- Harness migration bootstrap is complete.
- Latest Harness guidance treats `.harness/bootstrap.toml` as governance-only bootstrap metadata, while `harness:doc-health` is the audit standard for checking doc truth.
- Active project truth has been reset to the current codebase plus the Harness entry docs.
- **Phase 1 of the OpenAI-style layer-model program is complete**: the docs-and-hardgate pass froze the narrower end-state `src/` model, recorded the initial exception ledger, and aligned the front-door docs before source refactors.
- **Phase 3 assembly centralization is complete in this worktree**: observe/compact concrete assembly, refine bootstrap persistence assembly, refine run artifact assembly, and config bootstrap orchestration have now been pulled back toward shell-owned seams, and the refine-tools service-owned model is now the active truth.
- **Phase 4 hardgate ratchet is complete in this worktree**: the stale refine-tools provider/runtime allowance has been removed, architecture lint now matches the service-owned code truth, and structural proofs freeze the final shell-owned assembly model.
- **What Phase 2 changes**: Phase 2 narrows `kernel/` toward a pure engine-style layer by removing direct `kernel -> domain` and `kernel -> infrastructure` imports, pushing product-facing record shaping back into application-owned seams, and leaving only injected protocols inside the shared loop/tool path.
- **What Phase 2 does not promise**: this phase does not include the Phase 3 shell-centralization cleanup or rename `contracts/` to `ports/`, and it does not claim the service-owned refine-tools model is the focus of that pass.
- **Latest Phase 2 kernel slice is complete in this worktree**: `PiAgentLoop` now consumes engine-facing contracts from `src/contracts/**`, shell-owned composition resolves the concrete refine model through `ModelResolver` and injects it as a `PiAgentModel`, and `src/kernel/**` no longer imports `domain/*` or `infrastructure/*` directly. Fresh verification for this slice: `lint`, `test`, `typecheck`, `build`, and hardgate all pass; fresh hardgate evidence is `artifacts/code-gate/2026-03-23T05-08-12-656Z/report.json`.
- **Phase 3 Task 1 inventory is complete**: the remaining non-shell concrete adapter instantiations were grouped by ownership bucket and split into move-now versus temporary exception.
  - `observe`
    - concrete adapters instantiated in application-owned code: `PlaywrightDemonstrationRecorder` in `application/observe/observe-workflow-factory.ts`, `ArtifactsWriter` and `SopAssetStore` in `application/observe/observe-executor.ts`
    - decision: move-now in Phase 3
  - `compact`
    - concrete adapters instantiated in application-owned code: `JsonModelClient`, `TerminalCompactHumanLoopTool`, and `ArtifactsWriter` in `application/compact/interactive-sop-compact.ts`
    - decision: move-now in Phase 3
  - `refine`
    - concrete adapters instantiated in application-owned code: `AttentionKnowledgeStore` and `RefineHitlResumeStore` in `application/refine/refine-run-bootstrap-provider.ts`, `ArtifactsWriter` in `application/refine/react-refinement-run-executor.ts`
    - note: `application/refine/attention-guidance-loader.ts` is not counted here because it only consumes the store and does not instantiate a concrete adapter
    - decision: move-now in Phase 3
  - `config`
    - concrete adapters instantiated in application-owned code: `RuntimeBootstrapProvider` in `application/config/runtime-config-loader.ts`
    - decision at inventory time: temporary exception in the canonical ledger until Phase 3 Task 4 closed config ownership
- **Phase 3 Task 2 observe/compact assembly centralization is complete**: `runtime-composition-root.ts` now constructs the concrete observe/compact collaborators, while `application/observe/observe-workflow-factory.ts`, `application/observe/observe-executor.ts`, and `application/compact/interactive-sop-compact.ts` consume injected collaborators or factories instead of directly instantiating `PlaywrightDemonstrationRecorder`, `ArtifactsWriter`, `SopAssetStore`, `JsonModelClient`, or `TerminalCompactHumanLoopTool`. Fresh focused verification: `npm --prefix apps/agent-runtime run test -- test/application/layer-boundaries.test.ts test/application/observe/observe-workflow-factory.test.ts test/application/observe/observe-executor.test.ts test/application/compact/interactive-sop-compact.test.ts` passed with 85 tests green and 0 failures.
- **Phase 3 Task 3 refine bootstrap and executor assembly centralization is complete**: `runtime-composition-root.ts` now directly constructs the refine bootstrap persistence collaborators and the refine run artifacts writer factory, while `application/refine/refine-workflow.ts` and `application/refine/react-refinement-run-executor.ts` consume injected bootstrap/artifact seams instead of constructing concrete persistence writers inside refine-owned assembly. Fresh focused verification: `npm --prefix apps/agent-runtime run test -- test/application/layer-boundaries.test.ts test/application/refine/refine-workflow.test.ts test/application/refine/refine-telemetry-artifacts.test.ts test/replay-refinement/refine-react-run-executor.test.ts test/runtime/runtime-composition-root.test.ts` passed with 84 tests green and 0 failures.
- **Phase 3 Task 4 config ownership cleanup is complete**: `application/config/runtime-config-loader.ts` now owns only normalized config policy via `fromBootstrapSources(...)`; raw env/fs discovery stays in `infrastructure/config/runtime-bootstrap-provider.ts`; and `application/shell/runtime-config-bootstrap.ts` is the shell-owned bootstrap seam that joins those two halves. Fresh focused verification: `npm --prefix apps/agent-runtime run lint:arch` passed with 0 errors, and `npm --prefix apps/agent-runtime run test -- test/runtime/runtime-config-loader.test.ts test/runtime/runtime-bootstrap-provider.test.ts test/application/layer-boundaries.test.ts` passed with 79 tests green and 0 failures.
- **Phase 3 closeout verification is complete**: fresh `lint`, `lint:arch`, `npm --prefix apps/agent-runtime run test -- 'test/application/**/*.test.ts' 'test/runtime/*.test.ts'`, full `test`, `typecheck`, `build`, and `hardgate` all pass in this worktree; fresh hardgate evidence is `artifacts/code-gate/2026-03-23T06-18-23-543Z/report.json`.
- **Phase 4 hardgate ratchet closeout is complete**: stale exception-ledger allowances have been removed from the spec and `lint-architecture.mjs`; structural proofs now freeze shell-only concrete assembly and the narrowed kernel/application split; the refine-tools `services/*` seam is the active home; and the old `providers/*` / active `runtime/*` path is gone. Fresh verification for this closeout: `lint`, `node --test apps/agent-runtime/scripts/tests/*.test.mjs`, `test`, `typecheck`, and `build` all pass; the fresh hardgate report records the `lint` and `test` phases only, with the test phase covering the script-level ratchet tests plus the full repo test suite. Fresh hardgate evidence is `artifacts/code-gate/2026-03-23T11-17-46-430Z/report.json`.
- The current front-door truth is the post-pi-agent-hook-adapter baseline, with workflow-host clarification and telemetry/event-stream changes already absorbed.
- **Runtime telemetry event stream pass is complete in the current branch baseline**: telemetry policy now resolves from canonical config, shell composition injects run-scoped telemetry up front, refine writes canonical `event_stream.jsonl` plus a run summary artifact and `agent_checkpoints/`, and observe / compact no longer maintain separate runtime-log style write paths.
- Fresh hardgate evidence for this pass: `artifacts/code-gate/2026-03-21T14-38-44-019Z/report.json`.
- **Refine tool surface unification Tasks 1-8 are complete**: Task 1 froze the current bridge/bootstrap/facade regression behavior, Task 2 introduced refine-owned `tools/` core abstractions, Task 3 added provider/hook/lifecycle scaffolding, Task 4 migrated the runtime-facing refine tools into first-class definitions registered through a production-side runtime registry seam, Task 5 migrated the core browser-facing refine tools into first-class definitions registered through a production-side browser registry seam, Task 6 migrated screenshot/file-upload into first-class browser definitions while preserving capability negotiation behavior, Task 7 rebuilt `RefineReactToolClient` into a compatibility facade over explicit refine tool composition and removed the old adapter-centric registry path, and Task 8 completed refine-focused verification plus full project gates. Fresh hardgate evidence for this pass: `artifacts/code-gate/2026-03-22T14-24-10-690Z/report.json`.
- **Pi-agent hook adapter refactor Tasks 1-6 are complete**: canonical kernel entrypoints are now `pi-agent-loop.ts` and `pi-agent-tool-adapter.ts`; tool hooks run only through exact `toolName` registrations on the pi-agent execution path; direct `RefineToolSurface` / `RefineReactToolClient` / bootstrap calls are hook-free; legacy `agent-loop.ts` / `mcp-tool-bridge.ts` / `refine-tool-hook-observer.ts` seam has been removed. Fresh hardgate evidence for this pass: `artifacts/code-gate/2026-03-23T01-06-37-424Z/report.json`.
- **Workflow Host Task 5 is complete**: `runtime/agent-execution-runtime.ts` has been removed, `application/shell/runtime-host.ts` is the only top-level lifecycle owner, and compact service construction now happens in `runtime-composition-root.ts` instead of `workflow-runtime.ts`.
- **Cleanup Task 2 remains complete**: compatibility-only source shells under `src/core/**` and `src/runtime/**` have been deleted, and the final runtime wrapper has now been removed as well.
- **Cleanup Task 3 is complete**: legacy CLI compatibility behavior has been removed; only explicit `observe`, `refine`, and `sop-compact` commands remain, and unsupported grammar now fails without migration-era upgrade messaging.
- **Cleanup Task 4 is complete**: migration docs are archived, `docs/architecture/overview.md` is now the single short architecture front door, and `apps/agent-runtime/README.md` documents only the surviving CLI surface.
- **Cleanup Task 5 is complete**: the earlier post-cleanup gate set passed, and the workflow-host clarification pass now has fresh hardgate evidence at `artifacts/code-gate/2026-03-21T06-29-23-232Z/report.json`.
- **Task 9 is complete**: Final documentation cleanup, lint hardening, and gate closure done. The global layer-taxonomy reorganization plan is fully closed.
- **Task 8 is superseded by the current front door**: the remaining runtime lifecycle wrapper has been deleted, so top-level workflow lifecycle now lives in `application/shell/runtime-host.ts`.
- **Task 7 is complete**: refine bootstrap, prompts, tooling, orchestration, and executor ownership now live under `apps/agent-runtime/src/application/refine/`; the old runtime-era refine paths are no longer part of the active front door.
- **Task 6 is complete**: observe orchestration / recording support now live under `apps/agent-runtime/src/application/observe/`, and SOP compact now lives under `apps/agent-runtime/src/application/compact/`; old runtime-era paths are no longer part of the active front door.
- **Task 5 is complete**: the application shell and config areas now have canonical homes under `apps/agent-runtime/src/application/`; the old runtime-era shell/config/provider paths are no longer active architecture truth.
- **Task 4 is complete**: `kernel/` is now the canonical home for the true execution kernel; compatibility shells under `src/core/**` have been removed, so `core/` is not an active layer.
- **Task 3 is complete**: LLM adapters (`infrastructure/llm/`), config loading (`infrastructure/config/`), and persistence adapters (`infrastructure/persistence/`) are now in their canonical infrastructure homes.
- **Task 2 is complete**: legacy direct run has been removed as an active product surface; CLI contract is now `observe` / `refine` / `sop-compact`.
- Historical `.plan/*` documents remain available as background references, but they are no longer treated as active source of truth.

## Current Entry Commands
- `npm --prefix apps/agent-runtime run lint:arch`
- `npm --prefix apps/agent-runtime run lint`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`
- `node apps/agent-runtime/dist/index.js observe "打开百度，搜索咖啡豆，读取第一页搜索结果并截图"`
- `node apps/agent-runtime/dist/index.js refine "打开百度搜索咖啡豆，点击第一条搜索结果链接。"`

## Canonical Architecture

```
apps/agent-runtime/src/
  domain/           - Product concepts, state schemas, cross-layer contracts
  contracts/        - Capability interfaces plus shared runtime config / telemetry contracts
  kernel/           - Reusable execution kernel; Phase 2 direct-import cleanup is complete
    - pi-agent-loop.ts
    - pi-agent-tool-adapter.ts
  application/      - Use-case orchestration layer
    shell/          - CLI shell, command-router, runtime-host, top-level composition owner, config/bootstrap orchestration
    config/         - Application-facing normalized config semantics
    observe/        - Observe orchestration + recording support, consuming shell-prepared collaborators
    compact/        - SOP compact workflow, consuming shell-prepared model/HITL/artifact collaborators
    refine/         - Refine bootstrap, prompts, tooling, services, orchestration, executor, consuming shell-prepared bootstrap and artifact collaborators
  infrastructure/   - External adapters
    llm/            - model-resolver.ts, json-model-client.ts
    config/         - runtime-bootstrap-provider.ts
    persistence/    - artifacts-writer, runtime-event-stream-writer, agent-checkpoint-writer, sop-asset-store, attention-knowledge-store, refine-hitl-resume-store
    logging/        - runtime-logger, terminal-telemetry-sink
    mcp/            - mcp-stdio-client.ts
    browser/        - cdp-browser-launcher.ts, cookie-loader.ts
    hitl/           - terminal-hitl-controller.ts
```

## Current Kernel Boundary Status

`apps/agent-runtime/src/kernel/**` now stays inside the approved Phase 2 `engine -> contracts|kernel` surface. `pi-agent-loop.ts`, `pi-agent-tool-adapter.ts`, and `pi-agent-tool-hooks.ts` only depend on contracts, kernel-local seams, platform modules, and pi-agent libraries.

| Kernel file | Current import | Leakage class | Why it is still a leak today | Phase 2 removal target |
| --- | --- | --- | --- | --- |
| `src/kernel/pi-agent-loop.ts` | none outside `contracts/*`, `kernel/*`, Node, and pi-agent libraries | none | The loop now consumes `agent-loop-records.ts` and `pi-agent-model.ts` contracts instead of direct `domain` or `infrastructure` imports. | Phase 2 direct-import leak removed. |
| `src/kernel/pi-agent-tool-adapter.ts` | none outside `contracts/*`, `kernel/*`, Node, and pi-agent libraries | none | The adapter currently only translates `ToolClient` definitions into pi-agent tool protocol plus hook dispatch. | Keep in the narrowed kernel/engine subset; no further Phase 2 leak removal required here. |
| `src/kernel/pi-agent-tool-hooks.ts` | none outside `contracts/*` | none | The hook registry/types are already a narrow shared protocol. | Keep in the narrowed kernel/engine subset; no further Phase 2 leak removal required here. |

## Project Verification Notes
- `npm --prefix apps/agent-runtime run lint:docs` belonged to the completed Phase 1 docs-and-hardgate slice; it is not part of the active Phase 2 kernel-narrowing plan.
- `npm --prefix apps/agent-runtime run lint:arch`, `lint`, `test`, `typecheck`, `build`, and `hardgate` remain the current project verification commands for implementation work.
- Current local refine e2e baseline is:
  - system Chrome binary
  - `~/.sasiki/chrome_profile`
  - `~/.sasiki/cookies/*.json`
  - proxy-disabled launch command with `NO_PROXY` / `no_proxy`

## Current Documentation Truth
- Active entry docs:
  - `PROGRESS.md`
  - `NEXT_STEP.md`
  - `MEMORY.md`
  - `AGENT_INDEX.md`
  - `.harness/bootstrap.toml`
  - `docs/project/current-state.md`
  - `docs/architecture/overview.md`
- Active execution pointer:
  - `NEXT_STEP.md`
- Active governance spec / plan for the current worktree slice:
  - `docs/superpowers/specs/2026-03-23-refine-tools-service-consolidation-design.md`
  - `docs/superpowers/plans/2026-03-23-refine-tools-service-consolidation-implementation.md`
  - `docs/testing/refine-e2e-baidu-search-runbook.md`
- Latest completed implementation chain before this governance slice:
  - `docs/superpowers/plans/2026-03-23-agent-runtime-openai-style-layer-model-phase-1-implementation.md`
  - `docs/superpowers/specs/2026-03-22-pi-agent-hook-adapter-refactor-design.md`
  - `docs/superpowers/plans/2026-03-22-pi-agent-hook-adapter-refactor-implementation.md`
- Historical background docs:
  - `.plan/20260310_interactive_reasoning_sop_compact.md`
  - `.plan/20260312_replay_refinement_requirement_v0.md`
  - `.plan/20260312_replay_refinement_online_design.md`
  - `.plan/20260313_execution_kernel_refine_core_rollout.md`
  - `docs/superpowers/specs/2026-03-20-harness-doc-truth-sync.md`
  - `docs/superpowers/plans/2026-03-20-harness-doc-truth-sync-implementation.md`
  - `docs/superpowers/specs/2026-03-21-agent-runtime-layer-taxonomy-reorg.md`
  - `docs/superpowers/plans/2026-03-21-agent-runtime-layer-taxonomy-reorg-implementation.md`
  - `docs/superpowers/specs/2026-03-21-runtime-telemetry-event-stream-design.md`
  - `docs/superpowers/plans/2026-03-21-runtime-telemetry-event-stream-implementation.md`
  - `docs/superpowers/specs/2026-03-21-workflow-host-boundary-clarification.md`
  - `docs/superpowers/plans/2026-03-21-workflow-host-boundary-clarification-implementation.md`
  - `docs/superpowers/specs/2026-03-21-backward-capability-cleanup-design.md`
  - `docs/superpowers/plans/2026-03-21-backward-capability-cleanup-implementation.md`
  - `docs/architecture/layers.md`

## Follow-Up
- The taxonomy reorganization plan is complete and now serves as migration background.
- The current baseline is the post-pi-agent-hook-adapter front door.
- The latest real-browser refine smoke e2e is complete: run `20260323_211349_564` finished `completed` against the Baidu search runbook, with evidence in `artifacts/e2e/20260323_211349_564/`.
- The active follow-up in this worktree is now the first-turn bootstrap cleanup exposed by that run: remove the initial `act.navigate` call that still uses `sourceObservationRef=initial_navigation`, so the smoke path no longer depends on self-recovery after a known first-step failure.
- See `NEXT_STEP.md` for the exact current task pointer and execution path.
