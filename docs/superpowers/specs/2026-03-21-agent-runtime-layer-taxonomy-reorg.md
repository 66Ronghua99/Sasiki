---
doc_type: spec
status: active
supersedes:
  - docs/superpowers/specs/2026-03-21-runtime-surface-pruning-refactor.md
  - docs/superpowers/specs/2026-03-20-executor-bootstrap-boundary-refactor.md
related:
  - apps/agent-runtime/src/index.ts
  - apps/agent-runtime/src/core/agent-loop.ts
  - apps/agent-runtime/src/core/model-resolver.ts
  - apps/agent-runtime/src/runtime/runtime-composition-root.ts
  - apps/agent-runtime/src/runtime/providers/runtime-bootstrap-provider.ts
  - apps/agent-runtime/src/runtime/replay-refinement/react-refinement-run-executor.ts
---

# Agent Runtime Global Layer Taxonomy Spec

## Why This Spec Exists

The repository is no longer blocked by only one hotspot such as `run-executor.ts` or one single folder such as `runtime/replay-refinement/`.

The broader problem is architectural taxonomy drift:

- top-level folder names no longer match actual ownership
- `runtime/` mixes multiple layers and multiple flows
- `core/` mixes reusable engine logic with flow-specific SOP logic
- `providers/` is being used as a directory layer even though "provider" is an implementation pattern, not a stable architectural tier
- files that write records, prompts, flow state, config defaults, and CLI parsing sit beside each other without a consistent ownership rule

This spec is therefore broader than the current runtime-surface pruning slice. It defines the intended taxonomy for the whole `apps/agent-runtime/src` tree before more code moves happen.

## Current Diagnosis

### 1. Two Different Axes Are Mixed Together

The codebase currently mixes:

- **layer axis**: domain vs runtime vs infrastructure
- **flow axis**: observe vs compact vs refine vs legacy run

Those axes are both valid, but they are being expressed at the same folder depth. That is why the current tree feels incoherent.

### 2. `runtime/` Is Overloaded

`runtime/` currently contains all of the following:

- application shell and CLI routing
- config loading and defaulting
- flow-specific executors
- flow-specific prompts
- shared runtime persistence helpers
- migration-era provider seams

That makes `runtime/` too vague to act as a reliable architectural boundary.

### 3. `core/` Is Also Overloaded

The current `core/` directory contains at least three different kinds of things:

- reusable execution-kernel logic: `agent-loop.ts`, `mcp-tool-bridge.ts`
- model-provider resolution and completion helpers: `model-resolver.ts`, `json-model-client.ts`
- SOP/observe-specific trace building: `sop-demonstration-recorder.ts`, `sop-trace-builder.ts`, `sop-trace-guide-builder.ts`

Those do not belong to one single tier.

### 4. Provider Is A Pattern, Not A Layer

The current `runtime/providers/` directory includes:

- config bootstrap
- prompt assembly
- tool-surface selection
- refine bootstrap
- execution context construction

These files do not share one architectural layer. They share only one implementation style: "factory/provider." That is not enough to justify a stable top-level directory.

## Recommended Top-Level Taxonomy

This spec recommends the following semantic model for `src/`:

1. `domain/`
2. `contracts/`
3. `kernel/`
4. `application/`
5. `runtime/`
6. `infrastructure/`
7. `utils/`

The repository may keep temporary migration shims, but this is the target ownership model.

## Definitions

### Domain

`domain/` holds product concepts, state schemas, and cross-layer contracts that are independent of concrete runtime wiring.

Examples that fit:

- refine contracts such as `refine-react.ts`
- compact session data in `compact-reasoning.ts`
- SOP asset and trace schemas
- run result records and high-level log entry shapes

Domain should not know:

- CLI grammar
- filesystem paths
- browser launch
- prompt strings
- MCP transport

### Contracts

`contracts/` already behaves like ports/interfaces. That is a good layer, but the current name is slightly vague.

Examples that fit:

- logger
- tool client
- HITL controller
- compact human-loop tool

For this migration series, keep the physical directory name as `contracts/`. Renaming to `ports/` is explicitly deferred and is not part of the current plan.

### Kernel

`kernel/` should be the reusable execution kernel. It is what remains useful even if flow-level product orchestration changes.

This tier should contain:

- `agent-loop.ts`
- `mcp-tool-bridge.ts`

It should **not** contain:

- CLI parsing
- prompt assembly
- run-id creation
- artifact directory layout
- browser-profile policy
- flow-specific SOP/refine/compact orchestration

Important note:

- the current directory name `core/` is misleading because product discussions also use "core" to mean a future business flow (`core agent`)
- semantically, `kernel/` is a better name than `core/`

### Application

`application/` is the use-case and orchestration layer for this specific binary. It should own:

- CLI shell
- config normalization
- runtime composition
- flow orchestration
- prompt assembly
- product-specific persistence and artifact naming

This tier should contain things equivalent to the reference diagram's:

- providers
- services
- app wiring

This is where the current `runtime/` code should mostly end up, but with clearer internal ownership.

### Runtime

`runtime/` should be narrowed to long-lived execution state and live session semantics, not used as a catch-all for the whole app.

This tier should own things such as:

- active run/session state
- pause/resume state
- live observation/action timeline state
- step/turn execution state that exists only during or around a run

It should **not** own:

- CLI grammar
- config loading
- persistence adapters
- prompt text bundles
- top-level composition

### Infrastructure

`infrastructure/` wraps concrete integrations with external systems.

Examples that fit:

- browser launch and cookie loading
- MCP stdio client
- terminal HITL
- runtime logger

This tier should also absorb:

- LLM provider compatibility helpers
- config source loading
- persistence adapters

### Utils

`utils/` should stay small. It is only for genuinely low-level helpers that do not express product flow ownership.

Allowed examples:

- pure helpers
- small formatting/parsing helpers
- tiny cross-layer support functions with no state or lifecycle ownership

Not allowed:

- providers
- stores
- artifact writers
- session state
- config loaders
- anything that has a clear application, runtime, or infrastructure owner

## Dependency Matrix

The target dependency direction is:

- `utils` -> `utils` only
- `domain` -> `domain`, `utils`
- `contracts` -> `domain`, `utils`
- `kernel` -> `domain`, `contracts`, `utils`
- `runtime` -> `domain`, `contracts`, `utils`
- `infrastructure` -> `domain`, `contracts`, `utils`, external SDKs
- `application` -> `domain`, `contracts`, `kernel`, `runtime`, `infrastructure`, `utils`

Additional constraint:

- only application-owned shell/composition code may assemble infrastructure concretions directly
- runtime state code must not become a second composition layer

## File Placement Analysis

### Keep In Kernel

- `apps/agent-runtime/src/core/agent-loop.ts`
- `apps/agent-runtime/src/core/mcp-tool-bridge.ts`

Reason:

- both implement reusable execution mechanics rather than product-flow orchestration

### Move Out Of Current `core/`

- `apps/agent-runtime/src/core/sop-demonstration-recorder.ts`
- `apps/agent-runtime/src/core/sop-trace-builder.ts`
- `apps/agent-runtime/src/core/sop-trace-guide-builder.ts`

Reason:

- they are observe/SOP specific, not generic engine logic
- they should live under `application/observe/recording/` or a similar observe-owned area

### Likely Infrastructure, Not Kernel

- `apps/agent-runtime/src/core/model-resolver.ts`
- `apps/agent-runtime/src/core/json-model-client.ts`

Reason:

- both encode provider/baseUrl compatibility and external LLM integration policy
- they are closer to `infrastructure/llm/` than to the reusable execution kernel

### Application Shell

These belong to application shell / entry composition:

- `apps/agent-runtime/src/index.ts`
- `apps/agent-runtime/src/runtime/command-router.ts`
- `apps/agent-runtime/src/runtime/workflow-runtime.ts`
- `apps/agent-runtime/src/runtime/runtime-composition-root.ts`

Reason:

- they coordinate entrypoints, lifecycle, and top-level assembly
- they should not be mixed with flow-specific logic in the same folder depth

### Application Providers / Services

These files are valid abstractions, but they should be grouped by owning use case rather than by the generic label `provider`:

- `apps/agent-runtime/src/runtime/providers/prompt-provider.ts`
- `apps/agent-runtime/src/runtime/providers/tool-surface-provider.ts`
- `apps/agent-runtime/src/runtime/providers/execution-context-provider.ts`
- `apps/agent-runtime/src/runtime/providers/refine-run-bootstrap-provider.ts`
- `apps/agent-runtime/src/runtime/providers/legacy-run-bootstrap-provider.ts`

Rule:

- provider is a pattern inside the application layer
- it is not a stable top-level directory taxonomy

### Application Config

These belong to config/bootstrap policy:

- `apps/agent-runtime/src/runtime/runtime-config.ts`
- `apps/agent-runtime/src/runtime/providers/runtime-bootstrap-provider.ts`

Reason:

- `runtime-config.ts` is an application-facing config contract
- application wiring consumes config as input, but config source loading itself is infrastructure-owned
- the current `runtime-bootstrap-provider.ts` name reflects pattern, not ownership

### Runtime State

These files are closer to narrowed runtime semantics than to application shell:

- `apps/agent-runtime/src/runtime/replay-refinement/refine-react-session.ts`
- parts of pause/resume and live observation state currently spread across refine modules

Rule:

- runtime should mean active execution state, not the whole app layer

### Infrastructure Persistence / Config / LLM

These are adapters and should not remain under the generic runtime bucket:

- `apps/agent-runtime/src/runtime/artifacts-writer.ts`
- `apps/agent-runtime/src/runtime/sop-asset-store.ts`
- `apps/agent-runtime/src/runtime/replay-refinement/attention-knowledge-store.ts`
- `apps/agent-runtime/src/runtime/replay-refinement/refine-hitl-resume-store.ts`
- `apps/agent-runtime/src/core/model-resolver.ts`
- `apps/agent-runtime/src/core/json-model-client.ts`
- `apps/agent-runtime/src/runtime/providers/runtime-bootstrap-provider.ts`

Reason:

- they encode storage, config-source, or external-provider policy
- even when they write product-specific shapes, they still behave as adapters over filesystem or provider SDK details

### Observe-Owned Application Code

These should be grouped together:

- `apps/agent-runtime/src/runtime/observe-executor.ts`
- `apps/agent-runtime/src/runtime/observe-runtime.ts`
- `apps/agent-runtime/src/core/sop-demonstration-recorder.ts`
- `apps/agent-runtime/src/core/sop-trace-builder.ts`
- `apps/agent-runtime/src/core/sop-trace-guide-builder.ts`

Reason:

- they all serve observe/SOP capture and asset materialization
- observe orchestration should not sit beside unrelated runtime shell files
- persistence adapters used by observe may remain infrastructure-owned while being application-observe dependencies

### Compact-Owned Application Code

These should be grouped together:

- `apps/agent-runtime/src/runtime/interactive-sop-compact.ts`
- `apps/agent-runtime/src/runtime/interactive-sop-compact-prompts.ts`
- `apps/agent-runtime/src/runtime/compact-session-machine.ts`
- `apps/agent-runtime/src/runtime/compact-turn-normalizer.ts`
- `apps/agent-runtime/src/runtime/sop-rule-compact-builder.ts`

Reason:

- they form one cohesive standalone workflow
- there is no value in keeping them scattered at runtime root

### Refine-Owned Application Code

These should be grouped together under one refine-owned subtree:

- `apps/agent-runtime/src/runtime/replay-refinement/react-refinement-run-executor.ts`
- `apps/agent-runtime/src/runtime/replay-refinement/refine-react-tool-client.ts`
- `apps/agent-runtime/src/runtime/replay-refinement/refine-browser-tools.ts`
- `apps/agent-runtime/src/runtime/replay-refinement/refine-runtime-tools.ts`
- `apps/agent-runtime/src/runtime/replay-refinement/refine-browser-snapshot-parser.ts`
- application refine orchestration and tooling
- `apps/agent-runtime/src/runtime/replay-refinement/attention-guidance-loader.ts`
- `apps/agent-runtime/src/runtime/providers/refine-run-bootstrap-provider.ts`
- refine-owned prompt assembly currently inside `apps/agent-runtime/src/runtime/providers/prompt-provider.ts`

Reason:

- these files are one business flow
- `replay-refinement` is a historical name; `refine/` is the clearer semantic target
- refine bootstrap and prompt code should not live outside the refine-owned area
- refine persistence adapters may remain infrastructure-owned while serving refine

### Thin Wrappers That Need Re-Justification

These files currently add little semantic ownership:

- `apps/agent-runtime/src/runtime/agent-execution-runtime.ts`
- `apps/agent-runtime/src/runtime/observe-runtime.ts`
- `apps/agent-runtime/src/runtime/agent-runtime.ts`

They should either:

- gain clear lifecycle ownership, or
- be merged into app shell code

## Recommended Directory Shape

```text
apps/agent-runtime/src/
  domain/
  contracts/                  # optionally rename to ports/
  kernel/                     # semantic rename target for current core/
    agent-loop.ts
    mcp-tool-bridge.ts
  application/
    shell/
      command-router.ts
      workflow-runtime.ts
      runtime-composition-root.ts
    providers/                # transitional only; shrink over time
    services/
    observe/
      recording/
      orchestration/
    compact/
    refine/
      orchestration/
      tooling/
      prompts/
  runtime/
    sessions/
    state/
    execution/
  infrastructure/
    browser/
    mcp/
    llm/
      model-resolver.ts
      json-model-client.ts
    hitl/
    persistence/
    config/
  utils/
    errors/
    helpers/
```

## Migration Principles

1. Do not optimize around current folder names. Optimize around ownership.
2. Do not keep `providers/` as a stable architectural bucket.
3. Do not keep `core/` named as-is unless the team explicitly accepts the naming collision with future `core agent`.
4. Keep top-level app shell thin; root-like dumping of unrelated runtime files is not acceptable.
5. Place persistence code by ownership:
   - generic external file adapter -> infrastructure
   - product-specific artifact schema writer -> infrastructure/persistence or owning application flow
   - feature-specific store -> owning flow
6. Place prompt code by ownership:
   - flow-specific prompts stay with the flow
   - shell/config prompts stay with shell/config

## Immediate Implications For Future Refactor Plans

The next implementation plan should not be written as "pure flow-first runtime regrouping."

It should instead proceed in this order:

1. freeze semantic definitions and active truth first so subagents do not execute against stale boundaries
2. remove legacy direct-run and future core-flow product clutter
3. regroup application shell/providers/services vs observe/compact/refine
4. move observe-specific SOP recorder/trace code out of current `core/`
5. move LLM/config/persistence adapters out of current `core/` and `runtime/`
6. narrow `runtime/` so it means live execution state rather than the whole app layer

## Legacy CLI Contract For This Migration

The current migration freezes the external CLI direction as:

- `observe`
- `refine`
- `sop-compact`

Legacy contract decision:

- old `runtime` and `--mode run|observe` grammar should not remain an active supported interface
- during migration it may exist only as an explicit compatibility shim that fails with a clear upgrade message
- the end-state contract is explicit commands, not mode-switch flags

## Lint/Test Acceptance For The Future Plan

The future implementation plan derived from this spec should enforce at least:

- no new top-level files added directly under the current `runtime/` root except temporary migration shims
- no long-term top-level `provider` bucket as a fake layer
- no refine-owned files outside the refine-owned application subtree after cutover
- no observe-owned SOP recorder/asset code under kernel/core after cutover
- no LLM/config/persistence adapters left under kernel after cutover
- repo gates remain blocking:
  - `npm --prefix apps/agent-runtime run lint:arch`
  - `npm --prefix apps/agent-runtime run lint`
  - `npm --prefix apps/agent-runtime run test`
  - `npm --prefix apps/agent-runtime run typecheck`
  - `npm --prefix apps/agent-runtime run build`
  - `npm --prefix apps/agent-runtime run hardgate`
