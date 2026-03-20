---
doc_type: spec
status: active
supersedes: []
related:
  - docs/superpowers/specs/2026-03-20-provider-composition-root-refactor.md
  - docs/superpowers/plans/2026-03-20-provider-composition-root-refactor-implementation.md
  - apps/agent-runtime/src/runtime/runtime-composition-root.ts
  - apps/agent-runtime/src/runtime/providers/prompt-provider.ts
  - apps/agent-runtime/src/runtime/run-executor.ts
  - apps/agent-runtime/src/runtime/replay-refinement/react-refinement-run-executor.ts
  - apps/agent-runtime/src/runtime/providers/runtime-bootstrap-provider.ts
  - apps/agent-runtime/scripts/lint-architecture.mjs
---

# Executor And Bootstrap Boundary Refactor Spec

## Why This Is A New Spec

The previous provider/composition-root refactor spec intentionally solved the first structural slice:

- CLI parsing moved out of `index.ts`
- a dedicated composition root was introduced
- prompt/tool/context/bootstrap seams were made explicit
- the first round of architecture lint and focused tests was added

That first slice is implemented in the worktree. What remains is not just "more of the same checklist." The unfinished tasks now sit on behavior-critical surfaces:

- legacy run bootstrap and recovery behavior inside `run-executor.ts`
- refine bootstrap, resume, guidance preload, and prompt assembly inside `react-refinement-run-executor.ts`
- config source discovery and assembly policy still partially collapsed in `runtime-bootstrap-provider.ts`

Continuing to treat those as the tail of the old plan would blur the approval boundary that the first slice already closed. The old plan was useful as a phase map, but it was too broad to remain one execution slice all the way through executor slimming, bootstrap extraction, lint hardening, and fresh e2e.

This spec therefore starts the next approved refactor slice without changing the main direction established by the previous refactor spec.

The previous provider/composition-root spec and plan are now superseded as execution documents for this next slice. They remain background evidence for the first slice that already landed.

## Relationship To The Previous Refactor Spec

This spec does not replace the main refactor direction. It narrows the next slice under the same route:

1. `CLI routing`
2. `composition root`
3. `provider seams`
4. `executor/bootstrap boundary`
5. `config/bootstrap split`
6. `post-cutover cleanup`
7. `lint + tests + e2e verification`

The first three steps are already implemented. This spec covers only step 4 and the minimum lint/test/e2e work needed to accept it safely.

The later `config/bootstrap split` and broader cleanup remain future slices unless this spec explicitly calls them in.

## Problem

The architecture is cleaner than before, but executor boundaries still leak cross-cutting setup responsibility.

### Legacy Run Hotspot

`apps/agent-runtime/src/runtime/run-executor.ts` still owns too much non-execution work:

- converting request shape into SOP-consumption input
- resolving or faking SOP-consumption context
- logging bootstrap-side consumption decisions
- constructing retry and HITL resume prompts
- mixing execution, recovery policy, and artifact aggregation in one oversized file

This makes the legacy executor hard to read and hard to constrain by lint. It is still acting like both a bootstrap assembler and a runner.

### Refine Run Hotspot

`apps/agent-runtime/src/runtime/replay-refinement/react-refinement-run-executor.ts` still owns:

- resume-record loading
- task-scope derivation
- pre-observation before the agent loop
- page extraction from observation payloads
- guidance loading
- prompt assembly

That means the refine executor still decides how a run starts, not just how a prepared run executes and persists artifacts.

### Bootstrap Boundary Still Blurry

`apps/agent-runtime/src/runtime/providers/runtime-bootstrap-provider.ts` already hides config loading behind a provider, but it still combines:

- config-file discovery
- file/env precedence
- project-root discovery
- model defaulting policy
- runtime normalization

This full split is important, but it is a separate risk surface. Mixing it into the executor-boundary slice would make the current refactor too wide again.

## Recommended Slice

The next slice should be:

`Executor And Bootstrap Boundary Refactor`

Recommended scope:

- extract legacy run bootstrap/preparation out of `run-executor.ts`
- extract refine run bootstrap/preparation out of `react-refinement-run-executor.ts`
- keep recovery semantics, artifact semantics, and refine-react contracts unchanged
- extend `lint:arch` so the new executor boundary is enforceable
- add focused tests around the new bootstrap providers and keep full repo tests green
- finish with one fresh refinement e2e using the now-standard local route:
  - system Chrome
  - `~/.sasiki/chrome_profile`
  - `~/.sasiki/cookies`

## Success

- `run-executor.ts` consumes prepared legacy-run bootstrap input instead of resolving SOP-consumption inputs inline.
- `react-refinement-run-executor.ts` consumes prepared refine bootstrap input instead of loading resume/guidance/pre-observation state inline.
- refine start-prompt assembly is no longer embedded in the refine executor and remains aligned with the prompt-provider boundary.
- composition-root wiring remains explicit and becomes the entrypoint that joins bootstrap providers to executors.
- executor files become smaller, more legible, and easier to reason about as execution components.
- current runtime behavior remains unchanged:
  - legacy run recovery flow still works
  - refine resume semantics stay intact
  - artifact outputs remain compatible
  - refine-react tool contracts do not change in this slice

## Out Of Scope

- full `runtime-bootstrap-provider.ts` decomposition into source-loading vs default-policy modules
- plugin-style runtime architecture
- new refine tools, prompt semantics, or knowledge ranking logic
- post-cutover file rename/delete cleanup outside files directly required by this slice
- replacing the local e2e execution route with bundled Chrome again

## Target Boundary

### A. Legacy Run Bootstrap Provider

Introduce a focused boundary that prepares the legacy run before execution.

Responsibilities:

- convert `AgentRunRequest` into a legacy bootstrap input
- resolve SOP-consumption result or explicit no-consumption fallback
- provide the prepared loop task plus the record needed for artifact writing/logging

Non-responsibilities:

- executing loop attempts
- retry/HITL state transitions
- writing runtime artifacts

### B. Refine Run Bootstrap Provider

Introduce a focused boundary that prepares a refinement run before the executor starts the loop.

Responsibilities:

- resolve run id and optional resume context
- derive task scope
- perform required pre-observation
- normalize page bootstrap facts needed for guidance loading
- load top-N guidance
- provide the structured refine bootstrap inputs needed for starting the run

Prompt ownership note:

- the refine bootstrap provider may prepare prompt ingredients such as task, resume note, and loaded guidance
- the final refine start prompt must still be assembled in `apps/agent-runtime/src/runtime/providers/prompt-provider.ts` or a helper owned by that file's boundary
- this slice does not create a second prompt-owner inside bootstrap code

Non-responsibilities:

- deciding final run status
- writing artifacts
- persisting promoted knowledge
- handling runtime interrupts

### C. Executors

After cutover, executors should mainly own:

- loop execution
- retry / resume / pause state handling
- artifact persistence
- final result shaping

They may still own execution-time control flow, but they should no longer own bootstrap assembly.

Explicit legacy boundary for this slice:

- `buildRetryPrompt` and `buildResumePrompt` stay in `run-executor.ts` for now
- this slice extracts pre-run bootstrap only; it does not redesign execution-time recovery prompts
- if retry/resume prompt construction becomes a later hotspot, it should be handled by a future recovery-policy slice, not smuggled into this one

## Architecture Lint Acceptance

This slice is not accepted by review alone. `lint:arch` must enforce the new boundary.

- `run-executor.ts` must not import `runtime/sop-consumption-context.ts` after cutover.
- `react-refinement-run-executor.ts` must not import:
  - `attention-guidance-loader.ts`
  - `attention-knowledge-store.ts`
  - `refine-hitl-resume-store.ts`
  - prompt-assembly helpers outside the approved bootstrap boundary
- executor files must not import provider modules that themselves read raw config or env.
- new bootstrap-provider files must stay under default file-size budgets and must not receive legacy size exceptions.
- composition-root and provider paths must remain the only allowed assembly points for concrete bootstrap collaborators.

Representative lint intent:

- structure and import-direction invariants belong in `lint:arch`
- "executor should not assemble bootstrap state" must be expressed as import boundaries, not left as review folklore

## Test Acceptance

This slice must follow test-first work for every new boundary extraction.

### Focused Structural Tests

- add failing tests for legacy bootstrap-provider output:
  - consumption enabled path
  - consumption disabled fallback path
  - stable prepared task/result shape
- add failing tests for refine bootstrap-provider output:
  - resume path
  - pre-observation page extraction
  - guidance preload
  - prompt ingredients handed to the prompt-provider-owned assembly path
- update composition-root tests so they verify wiring through the new bootstrap providers instead of executor-owned setup

### Regression Tests

- keep existing `refine-react-run-executor` behavior tests green
- keep existing runtime tests green
- name and preserve these behavior-critical cases explicitly:
  - legacy fallback consumption still preserves request task and fallback metadata when SOP consumption is unavailable
  - legacy completed runs still fail if final screenshot capture is missing
  - legacy retry/HITL flow still writes intervention learning and resumes from current browser state
  - refine `paused_hitl` still persists resume payload and reuses the same run id on resume
  - refine runs still fail when `run.finish` is missing and still report `budget_exhausted` on turn-budget exhaustion
  - refine promoted knowledge is still written only on successful completed runs
- keep full repo `npm --prefix apps/agent-runtime run test` as a blocking gate

### Verification Gates

Completion requires all of:

- `npm --prefix apps/agent-runtime run lint:arch`
- `npm --prefix apps/agent-runtime run lint`
- `npm --prefix apps/agent-runtime run test`
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`
- `npm --prefix apps/agent-runtime run hardgate`

## End-To-End Acceptance

After code verification is green, this slice still requires one fresh refinement e2e.

Exact command:

```bash
env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY \
NO_PROXY=localhost,127.0.0.1,::1 no_proxy=localhost,127.0.0.1,::1 \
node apps/agent-runtime/dist/index.js \
  --config apps/agent-runtime/runtime.config.json \
  "打开小红书创作服务平台，创建一条长文笔记草稿（不要发布），填写任意标题后点击暂存离开；正文可留空。"
```

Route assumptions:

- system Chrome executable
- `~/.sasiki/chrome_profile`
- cookie injection from `~/.sasiki/cookies`
- explicit proxy bypass for `localhost` / `127.0.0.1` / `::1`

Evidence required:

- one fresh `artifacts/e2e/<run_id>/`
- record of proxy handling used during the run
- `refine_run_summary.json.status === "completed"`
- `steps.json` includes `run.finish` with `reason=goal_achieved`
- `refine_action_executions.jsonl` shows title input plus “暂存离开” click and a saved-success signal
- tab/context acceptance follows `docs/testing/refine-e2e-xiaohongshu-long-note-runbook.md`:
  - if a new tab opens, either `act.select_tab` appears before critical actions or the stale-tab guard fails explicitly
  - the active tab and `observe.page` facts stay aligned before critical actions
- progress/doc sync after the run

## Migration Shape

1. write failing tests for the new bootstrap boundaries
2. extract legacy bootstrap preparation
3. extract refine bootstrap preparation
4. cut executors over to prepared inputs
5. extend architecture lint to lock the new imports/boundaries
6. run full verification gates
7. run one fresh refinement e2e
8. then, and only then, consider the later config/bootstrap split slice

## Dos And Don'ts

Do:

- keep this slice narrower than the previous plan's remaining tail
- treat lint, tests, and e2e as part of the slice, not post-hoc cleanup
- hand execution to fresh subagents task-by-task once the spec and plan are approved

Don't:

- continue marking the old provider/composition-root plan as if all remaining tasks are one uninterrupted implementation step
- mix the full config/bootstrap split into this executor-boundary slice
- change runtime semantics while extracting bootstrap responsibilities
