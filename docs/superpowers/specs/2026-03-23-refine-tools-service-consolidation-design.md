---
doc_type: spec
status: draft
supersedes: []
related:
  - docs/superpowers/specs/2026-03-23-agent-runtime-openai-style-layer-model-design.md
  - docs/superpowers/specs/2026-03-22-refine-tool-surface-unification-design.md
  - docs/architecture/overview.md
  - docs/project/current-state.md
  - apps/agent-runtime/src/application/refine/refine-react-tool-client.ts
  - apps/agent-runtime/src/application/refine/tools/refine-tool-composition.ts
  - apps/agent-runtime/src/application/refine/tools/refine-tool-context.ts
  - apps/agent-runtime/src/application/refine/tools/definitions/
  - apps/agent-runtime/src/application/refine/tools/providers/
  - apps/agent-runtime/src/application/refine/tools/runtime/
---

# Refine Tools Service Consolidation Design

## Problem

The refine tool stack now has only one named architecture exception left in the Phase 4 ledger:

- `src/application/refine/tools/runtime/*.ts`
- `src/application/refine/tools/providers/*.ts`

That exception exists because the current ownership model is still split across too many layers for one tool call path:

- `definitions/*` own tool name, schema, and argument parsing
- `providers/*` read `contextRef`, synchronize `session` or `hitlAnswerProvider`, and forward calls
- `runtime/*` own most of the actual behavior, including raw MCP calls, payload shaping, observation and action recording, HITL semantics, knowledge candidate mutation, and finish-state mutation

This leaves the code in an awkward middle state:

- the real behavior owner is mostly `runtime/*`, but `definitions/*` cannot talk to it directly
- `providers/*` are too thin to be a durable boundary, yet they are still required for every definition
- `runtime/*` is a misleading name because these files now carry application-owned tool semantics, not a generic runtime layer
- the architecture gate can only tolerate this shape through an explicit exception instead of treating it as a stable model

The goal of this spec is to remove that ambiguity and define a durable ownership model so the exception can be deleted in a follow-up implementation pass.

## Chosen Direction

Collapse the current:

`definitions -> providers -> runtime`

into:

`definitions -> services`

using two explicit capability-owned services:

- `browserService`
- `runService`

In the target model:

- `definitions/*` remain the first-class agent-facing tool declarations
- `providers/*` are removed
- current `runtime/*` behavior is promoted and renamed into `services/*`
- `refine-tool-composition.ts` constructs those services and injects them into the refine tool context
- `definitions/*` call services directly through typed context access
- run-scoped rebinding becomes a first-class service responsibility instead of an indirect provider side effect

Recommended durable names:

- `application/refine/tools/services/refine-browser-service.ts`
- `application/refine/tools/services/refine-run-service.ts`

## Success

- `providers/*` no longer exist in the active refine tool path
- the refine tool context exposes stable service owners rather than provider facades
- `definitions/*` depend only on typed tool context and stable services
- `services/*` become the only owner of refine tool behavior:
  - browser observation and action semantics
  - raw MCP invocation and payload shaping
  - run-scoped HITL, knowledge candidate, and finish semantics
- `services/*` also become the only owner of run-scoped rebinding:
  - browser-side session rebinding
  - run-side session rebinding
  - run-side HITL answer provider rebinding
- `RefineReactToolClient` keeps the current external workflow-facing contract
- the exception ledger entry for the refine-tools runtime/provider split can be removed after implementation
- architecture lint can reject any attempt to reintroduce provider-forwarding or revive the old role split

## Out Of Scope

- no change to the 12 refine-agent-facing tool names
- no change to existing tool schemas beyond import-path or context-owner updates
- no change to refine prompt semantics
- no change to run success semantics, HITL policy, screenshot compatibility fallback, or knowledge ranking policy
- no cross-workflow generalization of the refine tool system
- no shell or kernel boundary redesign beyond the refine-tools seam itself

## Critical Paths

1. Replace provider-owned context synchronization with explicit service-owned rebinding APIs that are called by `RefineReactToolClient.setSession(...)` and `setHitlAnswerProvider(...)`.
2. Move `definitions/*` from provider dependencies to direct service dependencies without giving definitions direct access to raw MCP or session internals.
3. Rename the current `runtime/*` behavior owners into `services/*` so the directory semantics match the code truth.
4. Tighten lint and structural tests so the old provider/runtime split cannot silently regrow.

## Frozen Contracts

- refine still exposes the same 12 tool names in the same order
- `RefineReactToolClient` remains the workflow-facing `ToolClient` facade and keeps:
  - `setSession(...)`
  - `setHitlAnswerProvider(...)`
  - `getSession()`
- those three methods remain behaviorally identical after consolidation, but they delegate to service-owned rebinding instead of provider synchronization
- `RefineReactSession` remains the canonical run-scoped owner for:
  - observations
  - actions
  - pause state
  - finish state
  - knowledge candidates
  - promoted knowledge
- direct refine tool calls remain hook-free; pi-agent hook execution still happens only through `PiAgentToolAdapter`
- browser-side tool behavior keeps current observation validation, tab validation, and screenshot/file-upload compatibility semantics

## Architecture Invariants

- `definitions/*` may parse arguments and select a service, but must not directly:
  - call raw MCP tools
  - mutate `RefineReactSession`
  - read parser internals
- `services/*` are the only owner of refine tool behavior semantics
- `services/*` are also the only owner of dynamic run-scoped rebinding
- `services/*` may depend on:
  - `RefineReactSession`
  - raw `ToolClient`
  - refine-local parser helpers
  - injected answer-provider or equivalent narrow run-scoped collaborators
  - domain contracts already required by their behavior
- `refine-tool-composition.ts` remains the single refine-owned composition entrypoint for service construction and context assembly
- the tool context must expose behavior owners with domain meaning, not vague technical-role names
- the tool context must expose stable service references, not mutable provider facades or raw run-state scalars
- services must not recover the latest session or HITL answer provider by reading `contextRef` during tool invocation; rebinding happens only through explicit service APIs
- the active refine tool path must not reintroduce a generic `runtime/*` layer name after this consolidation

## Migration Strategy

### Stage 1: Introduce Service-Owned Rebinding Without Behavior Changes

- create `services/*` equivalents for the current browser and run behavior owners
- add explicit rebinding methods to the services so they own:
  - current `session`
  - current `hitlAnswerProvider` where applicable
- keep `RefineReactToolClient.setSession(...)`, `setHitlAnswerProvider(...)`, and `getSession()` as the public workflow-facing API
- make those client methods delegate to the new service-owned rebinding contract first
- preserve current behavior and tests
- keep composition responsible for wiring dependencies

### Stage 2: Move Definitions To Service-Owned Calls

- update each definition to read `browserService` or `runService` from context
- remove provider lookup helpers from definitions
- keep argument parsing in definitions
- prove that dynamic rebinding still works before removing providers:
  - browser tools see the latest session
  - run tools see the latest session
  - HITL behavior sees the latest answer provider

### Stage 3: Remove Provider Layer

- delete `providers/*`
- simplify context shape so it holds service references only
- remove provider-only tests or replace them with service/context tests

### Stage 4: Ratchet The Boundary

- update architecture lint so `providers/*` is no longer ledgered or tolerated
- update boundary tests to freeze:
  - no provider layer
  - no stale `runtime/*` naming
  - service-owned behavior model
- require proof that the active refine path no longer depends on `tools/runtime/*` after the rename
- remove the refine-tools exception ledger entry

## Failure Policy

- invalid tool context should fail explicitly with narrow error messages such as missing `browserService` or missing `runService`
- definitions must not add fallback paths that guess missing dependencies
- service construction should fail fast if required dependencies are missing
- existing browser capability fallbacks that are already part of current behavior, such as screenshot compatibility negotiation, remain allowed inside the browser service because they are part of the frozen tool contract rather than architecture recovery logic

## Acceptance

- a follow-up implementation plan exists for the consolidation pass
- the implementation removes `providers/*` from the active refine path
- the implementation removes or archives `tools/runtime/*` from the active refine path in favor of `tools/services/*`
- architecture lint rejects reintroduction of the provider/runtime split
- structural tests prove:
  - definitions no longer depend on providers
  - services own behavior
  - composition owns service assembly
- focused tests prove the frozen `RefineReactToolClient` rebinding contract still works end-to-end:
  - `setSession(...)`
  - `setHitlAnswerProvider(...)`
  - `getSession()`
- focused refine tool tests and full project gates stay green

## Deferred Decisions

- whether `services/*` should live directly under `application/refine/tools/services/` or be split further into browser/run subdirectories
- whether a later cleanup after this consolidation should narrow `RefineReactToolClient`'s rebinding API surface further without changing current workflow contracts
- whether a later cleanup should rename `RefineToolCompositionContext` to reflect the service-owned model more explicitly
