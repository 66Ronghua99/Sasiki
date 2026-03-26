# Refine Page-Level Retrieval Cues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Convert refine knowledge from `taskScope + category + cue` attention notes into page-level retrieval cues, expose them through `observe.page`, and let the agent reuse them through targeted `observe.query` without adding runtime heuristics or prompt-heavy coupling.

**Architecture:** Keep the change tool-surface-first. First narrow the contracts and persistence model to `page + guide + keywords`, then wire exact page-level loading into the refine tool composition so `observe.page` can return `pageKnowledge`, then repurpose `knowledge.record_candidate` and bootstrap visibility around the new model without changing `system-prompts.ts`. Runtime remains a thin exact-match loader and provenance owner; the agent remains the only decision-maker.

**Tech Stack:** TypeScript, Node test runner, refine tool surface, refine runtime persistence, Playwright MCP-backed `observe.page` / `observe.query`

---

**Spec Path:** `docs/superpowers/specs/2026-03-26-refine-page-level-retrieval-cues-design.md`

## Scope Freeze

- Do not add site-specific heuristics or page-type classifiers.
- Do not add a new `knowledge.search` tool in this pass.
- Do not expand `system-prompts.ts` in this pass.
- Do not add fallback or fuzzy page matching in runtime.
- Keep reuse keyed only by `page.origin + page.normalizedPath`.
- Keep the agent-facing cue payload minimal: `guide + keywords`.

## Allowed Write Scope

- `apps/agent-runtime/src/domain/attention-knowledge.ts`
- `apps/agent-runtime/src/domain/refine-react.ts`
- `apps/agent-runtime/src/application/refine/attention-guidance-loader.ts`
- `apps/agent-runtime/src/application/refine/refine-react-session.ts`
- `apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts`
- `apps/agent-runtime/src/application/refine/prompt-provider.ts`
- `apps/agent-runtime/src/application/refine/refine-workflow.ts`
- `apps/agent-runtime/src/application/refine/tools/refine-tool-composition.ts`
- `apps/agent-runtime/src/application/refine/tools/services/refine-browser-service.ts`
- `apps/agent-runtime/src/application/refine/tools/services/refine-run-service.ts`
- `apps/agent-runtime/src/application/refine/tools/definitions/observe-page-tool.ts`
- `apps/agent-runtime/src/application/refine/tools/definitions/knowledge-record-candidate-tool.ts`
- `apps/agent-runtime/src/infrastructure/persistence/attention-knowledge-store.ts`
- `apps/agent-runtime/src/application/shell/runtime-composition-root.ts`
- `apps/agent-runtime/test/application/refine/refine-browser-service.test.ts`
- `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
- `apps/agent-runtime/test/replay-refinement/refine-react-contracts.test.ts`
- `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
- `apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts`
- `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`
- `docs/superpowers/specs/2026-03-26-refine-page-level-retrieval-cues-design.md`
- `docs/superpowers/plans/2026-03-26-refine-page-level-retrieval-cues-implementation.md`
- `PROGRESS.md`
- `NEXT_STEP.md`
- `MEMORY.md`
- `docs/project/current-state.md`

## Verification Commands

- `npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-contracts.test.ts test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts`
- `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-browser-service.test.ts test/runtime/refine-run-bootstrap-provider.test.ts test/replay-refinement/refine-react-run-executor.test.ts`
- `npm --prefix apps/agent-runtime run lint`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`

## Evidence Location

- focused contract/tool-surface/browser-service/bootstrap test output
- updated spec + implementation plan under `docs/superpowers/`
- fresh repo gate evidence under `artifacts/code-gate/<timestamp>/report.json`

## File Map

- Create:
  - `docs/superpowers/plans/2026-03-26-refine-page-level-retrieval-cues-implementation.md`
- Modify:
  - `apps/agent-runtime/src/domain/attention-knowledge.ts`
  - `apps/agent-runtime/src/domain/refine-react.ts`
  - `apps/agent-runtime/src/application/refine/attention-guidance-loader.ts`
  - `apps/agent-runtime/src/application/refine/refine-react-session.ts`
  - `apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts`
  - `apps/agent-runtime/src/application/refine/prompt-provider.ts`
  - `apps/agent-runtime/src/application/refine/refine-workflow.ts`
  - `apps/agent-runtime/src/application/refine/tools/refine-tool-composition.ts`
  - `apps/agent-runtime/src/application/refine/tools/services/refine-browser-service.ts`
  - `apps/agent-runtime/src/application/refine/tools/services/refine-run-service.ts`
  - `apps/agent-runtime/src/application/refine/tools/definitions/observe-page-tool.ts`
  - `apps/agent-runtime/src/application/refine/tools/definitions/knowledge-record-candidate-tool.ts`
  - `apps/agent-runtime/src/infrastructure/persistence/attention-knowledge-store.ts`
  - `apps/agent-runtime/src/application/shell/runtime-composition-root.ts`
  - `apps/agent-runtime/test/application/refine/refine-browser-service.test.ts`
  - `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
  - `apps/agent-runtime/test/replay-refinement/refine-react-contracts.test.ts`
  - `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
  - `apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts`
  - `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`
  - `PROGRESS.md`
  - `NEXT_STEP.md`
  - `MEMORY.md`
  - `docs/project/current-state.md`

## Task 1: Freeze The New Cue Contracts And Remove TaskScope Gating

**Files:**
- Modify: `apps/agent-runtime/src/domain/attention-knowledge.ts`
- Modify: `apps/agent-runtime/src/domain/refine-react.ts`
- Modify: `apps/agent-runtime/src/infrastructure/persistence/attention-knowledge-store.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-contracts.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
- Modify: `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`

- [x] **Step 1: Write failing contract tests for page-level retrieval cues**
  - Add coverage that:
    - knowledge no longer requires `taskScope`
    - knowledge no longer requires `category`
    - knowledge now requires `guide`
    - knowledge now requires `keywords`
    - `observe.page` is allowed to return `pageKnowledge`

- [x] **Step 2: Run the focused contract tests to confirm failure**
  - Run: `npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-contracts.test.ts test/replay-refinement/refine-react-tool-client.test.ts test/runtime/refine-run-bootstrap-provider.test.ts`
  - Expected: failures around old `taskScope/category/cue` contracts and missing `pageKnowledge`

- [x] **Step 3: Narrow the domain models to the new cue shape**
  - In `attention-knowledge.ts`, replace the active cue payload with:
    - `page`
    - `guide`
    - `keywords`
    - provenance fields
  - In `refine-react.ts`, add the agent-visible `pageKnowledge` response shape for `observe.page`

- [x] **Step 4: Remove taskScope-based store querying**
  - Update `AttentionKnowledgeStore.query(...)` to match only on:
    - `page.origin`
    - `page.normalizedPath`
  - Keep exact matching only

- [x] **Step 5: Run the focused contract tests again**
  - Run: `npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-contracts.test.ts test/replay-refinement/refine-react-tool-client.test.ts test/runtime/refine-run-bootstrap-provider.test.ts`
  - Expected: PASS

- [x] **Step 6: Commit the contract slice**
  - Suggested commit: `feat: narrow refine knowledge to page-level cues`

## Task 2: Rewire Loader And Tool Composition So Observe.Page Can Return PageKnowledge

**Files:**
- Modify: `apps/agent-runtime/src/application/refine/attention-guidance-loader.ts`
- Modify: `apps/agent-runtime/src/application/refine/tools/refine-tool-composition.ts`
- Modify: `apps/agent-runtime/src/application/refine/tools/services/refine-browser-service.ts`
- Modify: `apps/agent-runtime/src/application/refine/tools/definitions/observe-page-tool.ts`
- Modify: `apps/agent-runtime/src/application/refine/refine-workflow.ts`
- Modify: `apps/agent-runtime/src/application/shell/runtime-composition-root.ts`
- Modify: `apps/agent-runtime/test/application/refine/refine-browser-service.test.ts`
- Modify: `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`

- [x] **Step 1: Write failing tests for pageKnowledge delivery**
  - Cover that:
    - `observe.page` returns `pageKnowledge`
    - `pageKnowledge` is empty on exact-page miss
    - runtime does not rerank or rewrite loaded cues
    - `includeSnapshot=false` still preserves the same `pageKnowledge`

- [x] **Step 2: Run the focused pageKnowledge tests to confirm failure**
  - Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-browser-service.test.ts test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts`
  - Expected: failures around missing `pageKnowledge`

- [x] **Step 3: Refactor the loader into a page-level cue loader without adding heuristics**
  - Keep the existing file if that is the smaller diff
  - Change it to return structured page cues instead of prompt-oriented only guidance text
  - Preserve exact page matching and limit behavior

- [x] **Step 4: Inject the loader into the refine tool composition**
  - Extend the tool-composition input/context so the browser service can load cues for the current page
  - Wire the concrete store-backed loader from `runtime-composition-root.ts` through `refine-workflow.ts`

- [x] **Step 5: Extend the browser service and observe.page definition**
  - After capturing the fresh observation, load exact page cues and return them as `pageKnowledge`
  - Keep `includeSnapshot=false` behavior intact
  - Do not make any query/action decision in runtime

- [x] **Step 6: Run the focused pageKnowledge tests again**
  - Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-browser-service.test.ts test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts`
  - Expected: PASS

- [x] **Step 7: Commit the observe.page delivery slice**
  - Suggested commit: `feat: return page-level knowledge from observe page`

## Task 3: Repurpose Knowledge.Record_Candidate And Promotion Around Guide + Keywords

**Files:**
- Modify: `apps/agent-runtime/src/application/refine/tools/definitions/knowledge-record-candidate-tool.ts`
- Modify: `apps/agent-runtime/src/application/refine/tools/services/refine-run-service.ts`
- Modify: `apps/agent-runtime/src/application/refine/refine-react-session.ts`
- Modify: `apps/agent-runtime/test/application/refine/refine-tool-surface.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts`
- Modify: `apps/agent-runtime/test/replay-refinement/refine-react-run-executor.test.ts`

- [x] **Step 1: Write failing tests for the new knowledge-record candidate schema**
  - Cover that:
    - `knowledge.record_candidate` requires `page`
    - it requires `guide`
    - it requires `keywords`
    - it rejects legacy `taskScope/category/cue`-only expectations
    - promoted knowledge is persisted and reloaded in the new shape

- [x] **Step 2: Run the focused knowledge-record tests to confirm failure**
  - Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts test/replay-refinement/refine-react-run-executor.test.ts`
  - Expected: failures around the legacy schema and stored payload shape

- [x] **Step 3: Rewrite the tool schema and description**
  - Make the description explicit that the tool records a page-level retrieval cue
  - Encourage short guides and one-to-three keywords
  - Explicitly discourage procedures and broad summaries

- [x] **Step 4: Update run-service and session promotion logic**
  - Validate `guide` and `keywords`
  - Persist only the approved cue fields plus provenance
  - Remove automatic dependence on `taskScope`

- [x] **Step 5: Run the focused knowledge-record tests again**
  - Run: `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts test/replay-refinement/refine-react-run-executor.test.ts`
  - Expected: PASS

- [x] **Step 6: Commit the knowledge-record slice**
  - Suggested commit: `feat: repurpose refine knowledge recording as page cues`

## Task 4: Make First-Turn Bootstrap Visibility Minimal And Prompt-Light

**Files:**
- Modify: `apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts`
- Modify: `apps/agent-runtime/src/application/refine/prompt-provider.ts`
- Modify: `apps/agent-runtime/test/runtime/refine-run-bootstrap-provider.test.ts`

- [x] **Step 1: Write failing bootstrap tests for first-turn page knowledge visibility**
  - Cover that:
    - bootstrap no longer depends on `taskScope + page` guidance injection semantics
    - first-turn current-page knowledge is visible to the agent in a minimal, data-only way if the hidden bootstrap `observe.page` would otherwise hide it
    - no changes are required in `system-prompts.ts`

- [x] **Step 2: Run the focused bootstrap tests to confirm failure**
  - Run: `npm --prefix apps/agent-runtime run test -- test/runtime/refine-run-bootstrap-provider.test.ts`
  - Expected: failures around the old guidance-loading assumption

- [x] **Step 3: Minimize bootstrap coupling**
  - Keep `system-prompts.ts` untouched
  - If bootstrap must surface the initial page cues, add them as factual current-page context only
  - Do not add new policy rules or heuristic instructions

- [x] **Step 4: Run the focused bootstrap tests again**
  - Run: `npm --prefix apps/agent-runtime run test -- test/runtime/refine-run-bootstrap-provider.test.ts`
  - Expected: PASS

- [x] **Step 5: Commit the bootstrap visibility slice**
  - Suggested commit: `refactor: minimize bootstrap page knowledge delivery`

## Task 5: Verify End-To-End Semantics And Sync State Docs

**Files:**
- Modify: `PROGRESS.md`
- Modify: `NEXT_STEP.md`
- Modify: `MEMORY.md`
- Modify: `docs/project/current-state.md`
- Modify: `docs/superpowers/specs/2026-03-26-refine-page-level-retrieval-cues-design.md`
- Modify: `docs/superpowers/plans/2026-03-26-refine-page-level-retrieval-cues-implementation.md`

- [x] **Step 1: Run the focused test suite for the whole slice**
  - Run:
    - `npm --prefix apps/agent-runtime run test -- test/replay-refinement/refine-react-contracts.test.ts test/application/refine/refine-tool-surface.test.ts test/replay-refinement/refine-react-tool-client.test.ts`
    - `npm --prefix apps/agent-runtime run test -- test/application/refine/refine-browser-service.test.ts test/runtime/refine-run-bootstrap-provider.test.ts test/replay-refinement/refine-react-run-executor.test.ts`
  - Expected: PASS

- [x] **Step 2: Run full repo verification**
  - Run:
    - `npm --prefix apps/agent-runtime run lint`
    - `npm --prefix apps/agent-runtime run test`
    - `npm --prefix apps/agent-runtime run typecheck`
    - `npm --prefix apps/agent-runtime run build`
    - `npm --prefix apps/agent-runtime run hardgate`
  - Expected: PASS

- [x] **Step 3: Sync state docs to the new active truth**
  - Update:
    - `PROGRESS.md`
    - `NEXT_STEP.md`
    - `MEMORY.md`
    - `docs/project/current-state.md`
  - Record that:
    - knowledge reuse is now page-level
    - `observe.page` returns `pageKnowledge`
    - `knowledge.record_candidate` uses `guide + keywords`
    - `NEXT_STEP.md` points to the next directly executable follow-up

- [x] **Step 4: Commit the closeout**
  - Suggested commit: `docs: close page-level retrieval cues slice`

## Completion Checklist

- [x] Knowledge retrieval is keyed only by `page.origin + page.normalizedPath`
- [x] `observe.page` returns `pageKnowledge`
- [x] `knowledge.record_candidate` records `page + guide + keywords`
- [x] Runtime performs exact loading only with no heuristic judgment or fallback
- [x] `system-prompts.ts` remains unchanged
- [x] Focused tests pass
- [x] Full repo gates pass
- [x] State docs are synchronized
