---
doc_type: spec
status: superseded
supersedes: []
related:
  - apps/agent-runtime/src/index.ts
  - apps/agent-runtime/src/runtime/workflow-runtime.ts
  - apps/agent-runtime/src/runtime/runtime-config.ts
  - apps/agent-runtime/src/runtime/system-prompts.ts
  - apps/agent-runtime/src/runtime/sop-consumption-context.ts
  - apps/agent-runtime/src/runtime/run-executor.ts
  - apps/agent-runtime/src/runtime/replay-refinement/react-refinement-run-executor.ts
  - apps/agent-runtime/src/infrastructure/mcp/mcp-stdio-client.ts
---

# Provider And Composition Root Refactor Spec

## Problem

After the stitched refinement subtree was removed, the remaining runtime path is smaller but still structurally collapsed around a few living hotspots:

- `apps/agent-runtime/src/index.ts` still mixes CLI argument parsing, config loading, command dispatch, runtime lifecycle, and signal handling.
- `apps/agent-runtime/src/runtime/workflow-runtime.ts` is acting as a god composition root: it constructs browser launch, MCP transport, SOP consumption, prompt selection, run-loop wiring, observe wiring, and refinement mode branching in one class.
- Tool, prompt, context, and bootstrap concerns are still concrete in-place decisions instead of explicit provider boundaries.
- `apps/agent-runtime/src/runtime/runtime-config.ts` merges source discovery, env precedence, model/provider defaulting, path resolution, and normalized runtime config shaping into one loader.
- Executor-specific bootstrap still leaks downward:
  - legacy run bootstraps SOP consumption outside an explicit provider contract
  - refine runtime bootstraps session, pre-observation, guidance loading, and HITL resume context inside the executor itself

This is now the main architecture drift surface. Lint and tests can stay green while future changes still become harder to locate, reason about, and migrate safely.

## Recommended Approach

Three approaches were considered:

1. Extract only `WorkflowRuntime` into a thinner composition layer.
2. Extract `composition root + provider seams` together.
3. Introduce a plugin-style runtime architecture.

This spec recommends **approach 2**.

Why this is the right next step:

- Approach 1 is too narrow; it would reduce constructor size but keep prompt/tool/context/bootstrap folklore hidden in concrete branches.
- Approach 3 is too ambitious for the current phase; it would add migration risk before the repo has stable provider seams.
- Approach 2 keeps the migration bounded while making the workflow surface explicit enough for future refactors and future agents.

## Success

- CLI parsing is separated from runtime command execution.
- A dedicated composition root becomes the only place allowed to instantiate concrete browser, MCP, logger, HITL, and executor dependencies.
- Prompt selection, tool-surface wiring, execution-context injection, and runtime bootstrap are each modeled as explicit provider seams.
- Mode selection (`run`, `observe`, `sop-compact`, refinement on/off, resume path) is expressed through small assembly units instead of nested construction inside `WorkflowRuntime`.
- Executors consume prepared dependencies and focused bootstrap input instead of owning config-resolution or infrastructure assembly decisions.
- Existing runtime behavior and current refine-react contracts are preserved; this refactor is structural, not semantic.

## Out Of Scope

- New browser capabilities, prompt semantics, or knowledge contracts.
- Replacing Playwright MCP transport.
- Replacing `AgentLoop`.
- Redesigning `AttentionKnowledge`.
- A full plugin marketplace or dynamically loaded runtime extension system.
- Security policy for config files and secrets, beyond clarifying provider boundaries.

## Architecture Debt Map

### 1. Entry And Lifecycle Collapse

`apps/agent-runtime/src/index.ts` currently owns:

- CLI grammar
- config loading
- mode validation
- runtime construction
- process signal bridging
- top-level command branching

That makes every new workflow or runtime mode depend on the same file and blurs the boundary between public CLI surface and runtime internals.

### 2. Composition Root Hidden Inside Runtime

`apps/agent-runtime/src/runtime/workflow-runtime.ts` currently owns:

- browser launcher construction
- MCP client construction
- SOP asset store and SOP consumption context assembly
- prompt selection
- raw vs refine tool client branching
- loop construction
- run executor branching
- observe executor assembly

This class is not really a runtime service anymore; it is the repository's concrete assembly graph hidden inside one constructor.

### 3. Missing Provider Seams

The following concerns exist, but only as implicit branches:

- prompt provider
- tool-surface provider
- execution-context provider
- runtime bootstrap provider

Because these seams are not explicit, future changes keep re-entering `WorkflowRuntime`, `index.ts`, or executor constructors.

### 4. Config And Bootstrap Coupling

`apps/agent-runtime/src/runtime/runtime-config.ts` currently mixes:

- locating config sources
- env fallback logic
- model/provider inference
- file parsing
- path normalization
- default runtime policy

That makes config loading both policy-heavy and hard to reuse in narrower runtime assembly layers.

### 5. Executor Bootstrap Leakage

`apps/agent-runtime/src/runtime/run-executor.ts` and `apps/agent-runtime/src/runtime/replay-refinement/react-refinement-run-executor.ts` still do more than execution:

- legacy run executor owns SOP-consumption recovery framing
- refine executor owns session bootstrap, guidance preload, HITL resume load, and prompt assembly

That makes the executors harder to understand as pure execution components.

## Target Architecture

The target architecture introduces four explicit provider seams plus one composition root:

### A. CLI Command Router

Responsibilities:

- parse argv
- validate command shape
- return a small command object

Non-responsibilities:

- building runtime dependencies
- handling process lifecycle
- branching on concrete infrastructure

### B. Runtime Composition Root

Responsibilities:

- instantiate concrete infrastructure
- choose mode-specific assembly path
- wire providers and executors together
- expose a small application-facing runtime service

Non-responsibilities:

- parsing CLI
- reading raw env directly outside approved providers
- embedding workflow semantics

### C. Prompt Provider

Responsibilities:

- select prompt set by workflow surface
- hide direct imports of prompt constants from composition branches
- provide prompt bundles for run/refine/compact surfaces

### D. Tool Surface Provider

Responsibilities:

- construct raw MCP client
- wrap refine-react tool surface when needed
- return the correct tool client shape for the selected mode

### E. Execution Context Provider

Responsibilities:

- legacy run context injection such as SOP consumption
- refinement preload context such as guidance and resume state
- mode-specific prompt augmentation inputs

### F. Runtime Bootstrap Provider

Responsibilities:

- normalize config source into a runtime assembly input
- resolve environment-dependent defaults in one place
- own browser/MCP startup policy inputs

## Architecture Invariants

- Only the composition root may instantiate concrete infrastructure adapters such as `CdpBrowserLauncher`, `McpStdioClient`, or `TerminalHitlController`.
- CLI parsing must not instantiate runtime services directly.
- Executors must not read raw env or raw config files.
- Prompt constants must be consumed through a prompt-provider boundary, not scattered across composition branches.
- Mode-specific context augmentation must happen through explicit provider interfaces, not executor-specific folklore.
- `run`, `observe`, and `refine` behavior contracts stay unchanged during this refactor unless a later approved spec says otherwise.

## Architecture Lint And Test Acceptance

This refactor is not accepted by review alone. The target architecture must be enforced by code lint and preserved by tests.

### Architecture Lint Acceptance

- `lint:arch` must stay green throughout the migration; layer direction and cycle rules do not get relaxed for the refactor.
- `lint:arch` must be extended so the new composition-root file, not `runtime/workflow-runtime.ts`, becomes the only allowed runtime importer of `infrastructure/mcp/*`.
- `lint:arch` must reject CLI parsing modules or parsed-command helpers that directly assemble infrastructure dependencies.
- `lint:arch` must reject direct prompt-constant imports outside the prompt-provider boundary once cutover is complete.
- New router/provider/composition-root files must stay under the default file-size budget and must not receive new legacy-size exceptions.

### Test Acceptance

- Add focused tests for command parsing so current `run` / `observe` / `sop-compact` grammar and archived-command failures remain stable.
- Add focused tests for runtime bootstrap/config precedence so file-vs-env behavior does not drift during the split.
- Add focused tests for composition-root mode selection so legacy run, refine run, observe, and resume paths still assemble the expected runtime surface.
- Existing runtime and refine-react tests must continue to pass without weakening current behavior assertions.
- Repository completion for this refactor requires a green `npm --prefix apps/agent-runtime run test`.

## Migration Shape

The migration should remain additive-first:

1. Introduce provider interfaces and a composition root alongside the current structure.
2. Move concrete assembly decisions out of `WorkflowRuntime` and `index.ts`.
3. Narrow executors so they consume prepared dependencies and bootstrap context.
4. Remove obsolete assembly paths only after parity verification.

## Dos And Don'ts

Do:

- keep phase 1 additive and boundary-first
- delete transitional files only after all active references have moved
- rename surviving files only when the new boundary is stable and clearer than the old name
- keep file retirement and rename work in a distinct post-cutover cleanup step

Don't:

- mix broad rename/delete sweeps into the first boundary-extraction pass
- delete files that are still part of active runtime wiring, docs, or tests
- rename public workflow entrypoints just because internals moved
- use renames to hide unresolved ownership or boundary confusion

## Acceptance

- A draftable refactor plan can point to explicit provider files and a composition-root file, not only to large in-place rewrites.
- `index.ts` becomes thinner and command-oriented.
- `WorkflowRuntime` stops being the main concrete assembly surface, or is replaced by a thinner app/runtime facade.
- Prompt, tool, context, and bootstrap concerns are each discoverable through explicit repository paths.
- The plan can execute in small, reviewable phases without changing user-visible workflow semantics.

## Deferred Decisions

- Whether `WorkflowRuntime` survives as a thin facade or is renamed to a clearer app/runtime shell.
- Whether SOP consumption and refinement guidance eventually share a single higher-level context-provider interface or stay as separate provider families under one umbrella.
- Whether config bootstrap should later split again into secret sourcing vs runtime policy normalization.
