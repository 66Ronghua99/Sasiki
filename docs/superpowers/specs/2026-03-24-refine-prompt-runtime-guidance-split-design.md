---
doc_type: spec
status: draft
supersedes: []
related:
  - apps/agent-runtime/src/application/refine/system-prompts.ts
  - apps/agent-runtime/src/application/refine/prompt-provider.ts
  - apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts
  - apps/agent-runtime/src/application/shell/runtime-composition-root.ts
  - apps/agent-runtime/src/contracts/runtime-config.ts
  - docs/superpowers/specs/2026-03-24-refine-observation-stabilization-design.md
---

# Refine Prompt Runtime Guidance Split Design

## Problem

The current refine prompt surface mixes two different ownership domains:

- stable agent policy and persona
- runtime/tool-method guidance derived from the live refine contract

Today those runtime details are duplicated across both:

- `REFINE_REACT_SYSTEM_PROMPT`
- `PromptProvider.buildRefineStartPrompt(...)`

Examples of drift-prone runtime guidance currently embedded in prompt text:

- what `observationReadiness = ready | incomplete` means
- that `observe.page` mints the current observationRef
- that `observe.query` searches only the latest captured snapshot
- that page-changing actions require a fresh `observe.page`
- that certain verified empty states are valid completion paths

This creates three problems:

1. static system prompt becomes a hidden owner of refine tool/runtime contract
2. start prompt and system prompt can drift apart while tests still pass
3. changing tool/adapter semantics requires editing prompt prose in multiple places

## Goal

Separate stable prompt policy from run-scoped runtime guidance so that method details are injected from lower layers instead of being hard-coded into the static refine system prompt.

## Non-Goals

- No behavior change to the current refine tool semantics in this pass.
- No redesign of the observation contract in this pass.
- No attempt to remove all task/run-specific guidance from prompts.
- No new lint or hardgate rule in this pass.

## Design Principles

1. `system-prompts.ts` should own stable policy only.
2. Runtime/tool semantics should come from the contract-owning layer.
3. The same runtime rule should have one prompt source of truth.
4. Task-specific completion hints should not be promoted to timeless system policy.

## Ownership Split

### 1. Stable System Prompt

`application/refine/system-prompts.ts` should keep only material that is expected to remain stable across runs and tool-surface iterations:

- refine agent role and project background
- AttentionKnowledge purpose
- high-level responsibilities
- durable safety and provenance expectations
- durable architectural boundaries such as "use refine-react tools only"

This layer should not enumerate low-level method sequencing tied to the current observation/tool contract.

### 2. Runtime Guidance Block

Introduce a separate runtime-guidance input that is assembled below the static prompt layer and injected by `PromptProvider`.

The first version can stay simple and string-based internally, but its ownership should be explicit and singular.

Suggested shape:

- `observationContractGuidance`
- `actionSequencingGuidance`
- `completionGuidance`

These can later collapse into one `runtimeGuidance` block at render time.

### 3. Guidance Owners

Runtime guidance should be sourced from the layer that owns the underlying contract:

- observation-readiness semantics
  - owner: observation/tool contract
- observationRef lifecycle and re-observe rules
  - owner: browser tool surface / refine browser service contract
- query freshness semantics
  - owner: `observe.query` contract
- task-class completion hints such as verified empty inbox completion
  - owner: run-scoped task guidance, not the timeless system prompt

The injection path should flow upward:

- tool/adapter truth
- bootstrap/composition assembly
- prompt-provider rendering

not the reverse.

## Prompt Assembly Direction

`PromptProvider` should become the single assembly point that combines:

1. stable refine system prompt
2. initial observation facts
3. loaded Attention guidance
4. resume context
5. injected runtime guidance

The refine system prompt should not repeat the runtime-guidance block.

## Testing Direction

Tests should shift from freezing repeated prose in two places to freezing ownership and assembly behavior:

- `system-prompts.ts` does not contain runtime/tool contract details
- `PromptProvider` renders the runtime-guidance block once
- runtime guidance can be changed at its source without editing multiple prompt constants

## Acceptance

- `system-prompts.ts` no longer owns refine tool/runtime sequencing details
- runtime/tool guidance is injected through prompt assembly instead of duplicated static prose
- prompt assembly has one source of truth for current execution guidance
- task-specific completion hints are kept out of timeless system prompt text
- tests verify ownership split, not duplicate wording across prompt layers

## Deferred Decisions

- Whether the runtime-guidance input should remain string-based or become fully typed
- Whether future task/runbook guidance should reuse the same injection channel
- Whether this split should later be promoted into a structural lint or hardgate rule
