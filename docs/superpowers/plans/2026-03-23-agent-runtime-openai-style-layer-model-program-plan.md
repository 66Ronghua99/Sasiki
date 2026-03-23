# Agent Runtime OpenAI-Style Layer Model Program Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the full multi-phase migration from the current `agent-runtime` dependency graph to the narrower OpenAI-style layer model defined in [`2026-03-23-agent-runtime-openai-style-layer-model-design.md`](/Users/cory/codes/Sasiki-dev/docs/superpowers/specs/2026-03-23-agent-runtime-openai-style-layer-model-design.md).

**Architecture:** This program intentionally separates target-state design from execution slices. Phase 1 freezes the target model and adds baseline transitional hardgates without forcing a repo-wide refactor; Phases 2-4 progressively narrow `kernel`, centralize concrete assembly, and then ratchet hard gates against the new structure. Each phase must land green and leave the repo in a mergeable state before the next phase begins.

**Tech Stack:** TypeScript, Node 20, Node test runner, project-local architecture lint, Harness governance docs.

---

## Program Structure

- Phase 1 plan:
  - [`2026-03-23-agent-runtime-openai-style-layer-model-phase-1-implementation.md`](/Users/cory/codes/Sasiki-dev/docs/superpowers/plans/2026-03-23-agent-runtime-openai-style-layer-model-phase-1-implementation.md)
- Phase 2 plan:
  - [`2026-03-23-agent-runtime-openai-style-layer-model-phase-2-kernel-narrowing-implementation.md`](/Users/cory/codes/Sasiki-dev/docs/superpowers/plans/2026-03-23-agent-runtime-openai-style-layer-model-phase-2-kernel-narrowing-implementation.md)
- Phase 3 plan:
  - [`2026-03-23-agent-runtime-openai-style-layer-model-phase-3-assembly-centralization-implementation.md`](/Users/cory/codes/Sasiki-dev/docs/superpowers/plans/2026-03-23-agent-runtime-openai-style-layer-model-phase-3-assembly-centralization-implementation.md)
- Phase 4 plan:
  - [`2026-03-23-agent-runtime-openai-style-layer-model-phase-4-hardgate-ratchet-implementation.md`](/Users/cory/codes/Sasiki-dev/docs/superpowers/plans/2026-03-23-agent-runtime-openai-style-layer-model-phase-4-hardgate-ratchet-implementation.md)

## Execution Order

- [ ] Complete Phase 1 and capture fresh verification evidence
- [ ] Re-read the exception ledger and choose the first removable `kernel` exceptions
- [ ] Complete Phase 2 and reduce `kernel` to a narrower engine-style seam
- [ ] Complete Phase 3 and move concrete assembly back toward shell ownership
- [ ] Complete Phase 4 and tighten hard gates to match the new code truth

## Phase Exit Criteria

### Phase 1

- target layer model documented
- phase-1 exception ledger recorded
- lint and structural proofs added
- repo verification green

### Phase 2

- `kernel` no longer imports product domain or concrete infrastructure
- application owns workflow-specific state mapping into the engine
- transitional exceptions for `kernel` are reduced or removed

### Phase 3

- shell owns top-level concrete assembly
- workflow modules no longer directly instantiate concrete adapters except approved transitional seams
- config source loading stays outside application policy modules

### Phase 4

- hard gates reflect current code truth rather than phase-1 transition allowances
- remaining exceptions are either removed or explicitly deferred with owners
- docs, lint, tests, and evidence are synchronized

## Cross-Phase Rules

- [ ] Each phase must leave the repo green and mergeable
- [ ] Do not mix broad directory churn with behavior changes when a narrower slice is possible
- [ ] Do not silently widen the architecture model to fit current drift
- [ ] Use exception-ledger entries for temporary reality, not as a permanent escape hatch
- [ ] Sync `PROGRESS.md`, `MEMORY.md`, and `NEXT_STEP.md` at the end of every phase
- [ ] Treat [`2026-03-23-agent-runtime-openai-style-layer-model-design.md`](/Users/cory/codes/Sasiki-dev/docs/superpowers/specs/2026-03-23-agent-runtime-openai-style-layer-model-design.md) as the canonical exception-ledger source until explicitly replaced

## Recommended Subagent Routing

- Phase 1:
  - one subagent for docs/governance sync
  - one subagent for `lint-architecture.mjs`
  - one subagent for fixture and structural tests
- Phase 2:
  - one subagent for `kernel` seam extraction
  - one subagent for engine-facing tests
  - one subagent for docs and exception-ledger cleanup
- Phase 3:
  - one subagent for shell/composition-root changes
  - one subagent for observe/compact/refine injection cleanup
  - one subagent for config ownership cleanup
- Phase 4:
  - one subagent for hardgate tightening
  - one subagent for final proof and doc sync

## Final Delivery Expectation

At program completion, `apps/agent-runtime/src` should present a stable architecture that future agents can infer from paths and lint alone:

- `domain` for product semantics
- `contracts/ports` for stable capability seams
- `kernel/engine` for generic execution only
- `application` for workflow orchestration only
- `infrastructure` for concrete adapter implementations
- `application/shell` as the only top-level concrete assembly owner
