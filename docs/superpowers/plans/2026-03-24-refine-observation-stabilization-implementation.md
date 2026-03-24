# Refine Observation Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bounded observation stabilization pass to `observe.page`, keep agent-visible health minimal, and ground the new parser behavior in a frozen corpus of real Playwright MCP snapshots.

**Architecture:** This plan keeps the work adapter-first. It starts by freezing real raw snapshot shapes and parser-safe assumptions, then extends the observation contract with a single agent-visible readiness signal plus derived tab views, then adds the `Hybrid gate` settle loop and internal diagnostics in the browser service. Prompt wording and docs are updated only after the adapter truth exists.

**Tech Stack:** TypeScript, Node test runner, Playwright MCP raw snapshots, refine runtime tool surface

---

**Spec Path:** `docs/superpowers/specs/2026-03-24-refine-observation-stabilization-design.md`

## Scope Freeze

- Do not add OCR, screenshot fusion, or DOM-evaluate side channels in this pass.
- Do not make `observe.query` auto-refresh the page in this pass.
- Do not promote semantic regions into a required truth source in this pass.
- Keep agent-visible health to a single new field: `observationReadiness`.
- Keep raw `snapshot` and raw `tabs` as provenance truth.

## Allowed Write Scope

- `apps/agent-runtime/src/domain/refine-react.ts`
- `apps/agent-runtime/src/application/refine/refine-browser-snapshot-parser.ts`
- `apps/agent-runtime/src/application/refine/tools/services/refine-browser-service.ts`
- `apps/agent-runtime/src/application/refine/tools/definitions/observe-page-tool.ts`
- `apps/agent-runtime/src/application/refine/prompt-provider.ts`
- `apps/agent-runtime/src/application/refine/system-prompts.ts`
- `apps/agent-runtime/test/application/refine/**`
- `apps/agent-runtime/test/replay-refinement/**`
- `docs/project/current-state.md`
- `PROGRESS.md`
- `NEXT_STEP.md`
- `MEMORY.md`
- `docs/superpowers/specs/2026-03-24-refine-observation-stabilization-design.md`
- `docs/superpowers/plans/2026-03-24-refine-observation-stabilization-implementation.md`

## Verification Commands

- `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-browser-service.test.ts test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts test/replay-refinement/refine-react-contracts.test.ts`
- `npm --prefix apps/agent-runtime run lint`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`

## Evidence Location

- committed snapshot corpus fixtures under `apps/agent-runtime/test/application/refine/fixtures/`
- focused test output for parser/browser-service/tool-surface/contracts
- fresh repo gate evidence under `artifacts/code-gate/<timestamp>/report.json`

## File Map

- Create:
  - `apps/agent-runtime/test/application/refine/fixtures/browser-snapshot-corpus/playwright-home-stable.md`
  - `apps/agent-runtime/test/application/refine/fixtures/browser-snapshot-corpus/multi-tab-stale-page-url.md`
  - `apps/agent-runtime/test/application/refine/fixtures/browser-snapshot-corpus/modal-search-overlay.md`
  - `apps/agent-runtime/test/application/refine/fixtures/browser-snapshot-corpus/shell-only-thin-page.md`
  - `apps/agent-runtime/test/application/refine/refine-browser-snapshot-parser.test.ts`
  - `docs/superpowers/plans/2026-03-24-refine-observation-stabilization-implementation.md`
- Modify:
  - `apps/agent-runtime/src/domain/refine-react.ts`
  - `apps/agent-runtime/src/application/refine/refine-browser-snapshot-parser.ts`
  - `apps/agent-runtime/src/application/refine/tools/services/refine-browser-service.ts`
  - `apps/agent-runtime/src/application/refine/tools/definitions/observe-page-tool.ts`
  - `apps/agent-runtime/src/application/refine/prompt-provider.ts`
  - `apps/agent-runtime/src/application/refine/system-prompts.ts`
  - `apps/agent-runtime/test/application/refine/refine-browser-service.test.ts`
  - `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
  - `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
  - `apps/agent-runtime/test/replay-refinement/refine-react-contracts.test.ts`
  - `docs/project/current-state.md`
  - `PROGRESS.md`
  - `NEXT_STEP.md`
  - `MEMORY.md`

## Task 1: Freeze Real Snapshot Corpus And Parser-Safe Assumptions

**Files:**
- Create: `apps/agent-runtime/test/application/refine/fixtures/browser-snapshot-corpus/*.md`
- Create: `apps/agent-runtime/test/application/refine/refine-browser-snapshot-parser.test.ts`
- Modify: `apps/agent-runtime/src/application/refine/refine-browser-snapshot-parser.ts`

- [x] **Step 1: Add the real raw snapshot corpus fixtures**
  - Commit a small corpus of real Playwright MCP `browser_snapshot` outputs with minimal labeling and no structural rewriting.

- [x] **Step 2: Write failing parser tests against the corpus**
  - Cover at least:
    - `Open tabs` parsing
    - stale `Page URL` repair through active tab identity
    - `<changed>` snapshot lines remaining parseable
    - `[ref=...]` extraction staying intact
    - noise tabs remaining in raw `tabs`

- [x] **Step 3: Extend parser helpers only as far as the corpus requires**
  - Keep the parser focused on mechanical extraction:
    - raw tab provenance
    - page identity hints
    - ref-bearing element extraction
    - derived `pageTab` / `taskRelevantTabs`
    - internal snapshot metrics needed by stabilization

- [x] **Step 4: Run focused parser tests**
  - Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-browser-snapshot-parser.test.ts`

- [x] **Step 5: Commit the corpus and parser baseline**
  - Suggested commit: `test: freeze refine browser snapshot corpus`

## Task 2: Extend Observe Contracts With Minimal Agent-Visible Additions

**Files:**
- Modify: `apps/agent-runtime/src/domain/refine-react.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-contracts.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`

- [x] **Step 1: Write failing contract tests for the new observation shape**
  - Add coverage for:
    - `observationReadiness`
    - `pageTab`
    - `taskRelevantTabs`
  - Keep the tests explicit that these are the only new agent-visible fields.

- [x] **Step 2: Extend the domain observation types**
  - Add the minimal agent-visible fields to `PageObservation`.
  - Keep internal stabilization details out of the public response shape.

- [x] **Step 3: Update tool-client level observation tests**
  - Verify `observe.page` still returns raw `snapshot` plus the new readiness and derived tab views.
  - Verify raw `tabs` are preserved alongside the derived tab subset.

- [x] **Step 4: Run the focused contract/tool-client tests**
  - Run: `npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-contracts.test.ts test/replay-refinement/refine-react-tool-client.test.ts`

- [x] **Step 5: Commit the contract slice**
  - Suggested commit: `feat: narrow refine observation contract`

## Task 3: Implement Hybrid Gate In The Browser Service

**Files:**
- Modify: `apps/agent-runtime/src/application/refine/tools/services/refine-browser-service.ts`
- Modify: `apps/agent-runtime/test/application/refine/refine-browser-service.test.ts`
- Modify: `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`

- [x] **Step 1: Write failing browser-service tests for stabilization**
  - Cover at least:
    - pre-gate timeout is non-fatal
    - settle loop stops early on convergence
    - hard timeout returns `observationReadiness = incomplete`
    - converged observations return `observationReadiness = ready`
    - `pageTab` / `taskRelevantTabs` remain available on stabilized observations

- [x] **Step 2: Add internal stabilization helpers inside the browser service**
  - Implement:
    - short pre-gate
    - bounded settle loop
    - convergence comparison over parser-produced metrics
    - best-observation selection on timeout

- [x] **Step 3: Keep internal diagnostics internal**
  - Record whatever settle/convergence metadata the service needs internally for debugging, but do not expose it through the agent-visible observation payload in this slice.

- [x] **Step 4: Update the `observe.page` tool description**
  - Make the description reflect that the tool returns a fresh observation with readiness information and derived task-facing tab views.

- [x] **Step 5: Run focused browser-service/tool-surface tests**
  - Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-browser-service.test.ts test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts`

- [x] **Step 6: Commit the stabilization slice**
  - Suggested commit: `feat: stabilize refine page observation`

## Task 4: Teach The Prompt About Readiness And Close The Loop

**Files:**
- Modify: `apps/agent-runtime/src/application/refine/prompt-provider.ts`
- Modify: `apps/agent-runtime/src/application/refine/system-prompts.ts`
- Modify: `apps/agent-runtime/test/application/refine/prompt-provider.test.ts`
- Modify: `docs/project/current-state.md`
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`

- [x] **Step 1: Write failing prompt tests for readiness-aware guidance**
  - Add coverage that the prompt tells the agent how to treat `observationReadiness = incomplete` conservatively.

- [x] **Step 2: Update prompt wording minimally**
  - Do not add a large new prompt section.
  - Only teach the agent that:
    - `observationReadiness = ready` means the observation is safe to reason over
    - `observationReadiness = incomplete` means it should avoid over-trusting the current observation

- [x] **Step 3: Run focused prompt tests**
  - Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/prompt-provider.test.ts`

- [x] **Step 4: Run full repo verification**
  - Run:
    - `npm --prefix apps/agent-runtime run lint`
    - `npm --prefix apps/agent-runtime run test`
    - `npm --prefix apps/agent-runtime run typecheck`
    - `npm --prefix apps/agent-runtime run build`
    - `npm --prefix apps/agent-runtime run hardgate`

- [x] **Step 5: Sync state docs**
  - Update:
    - `docs/project/current-state.md`
    - `PROGRESS.md`
    - `NEXT_STEP.md`
    - `MEMORY.md`
  - Set `NEXT_STEP.md` to the next directly executable pointer after stabilization lands.

- [x] **Step 6: Commit the prompt/doc closeout**
  - Suggested commit: `docs: close refine observation stabilization slice`

## Completion Checklist

- [x] Real snapshot corpus is committed
- [x] `observe.page` exposes only the approved new agent-visible fields
- [x] Hybrid gate is implemented with bounded settle behavior
- [x] Prompt guidance mentions `observationReadiness` conservatively
- [x] Full repo gates pass
- [x] State docs are synchronized
