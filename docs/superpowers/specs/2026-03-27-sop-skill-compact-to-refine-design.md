---
doc_type: spec
status: accepted
supersedes: []
related:
  - apps/agent-runtime/src/application/compact/interactive-sop-compact.ts
  - apps/agent-runtime/src/application/compact/interactive-sop-compact-prompts.ts
  - apps/agent-runtime/src/application/refine/refine-run-bootstrap-provider.ts
  - apps/agent-runtime/src/application/refine/prompt-provider.ts
  - apps/agent-runtime/src/application/refine/tools/services/refine-browser-service.ts
  - apps/agent-runtime/src/application/shell/command-router.ts
  - apps/agent-runtime/src/domain/agent-types.ts
  - apps/agent-runtime/src/domain/sop-asset.ts
  - apps/agent-runtime/src/infrastructure/persistence/sop-asset-store.ts
---

# SOP Skill Compact To Refine Design

## Problem

The current `observe -> sop-compact -> refine` chain still has the wrong product shape for the next phase.

Today:

- `observe` records a browser demonstration and writes trace artifacts
- `sop-compact` produces a session-local `compact_capability_output.json`
- `refine` starts mainly from the live user prompt plus runtime page-level guidance

This is not yet the desired handoff model.

The missing product behavior is:

- `sop-compact` should turn one observed workflow plus human clarification into a reusable named SOP skill
- that SOP skill should help refine understand what the workflow is really for, not just what the user typed in the current run
- refine should keep running when either the user prompt or the SOP reference is missing
- SOP knowledge should follow the same single-file skill shape as the existing coding-agent skills: YAML frontmatter plus markdown body

The current `run_id`-centric compact output is still too transient and too tied to one compact session. It does not yet behave like a durable user-level skill.

## Success

- `sop-compact` produces a reusable named SOP skill instead of only a session-local compact artifact.
- Each SOP skill is a single markdown document with two conceptual layers:
  - YAML frontmatter containing at least `name` and `description`
  - a detailed markdown body that reads like an existing `SKILL.md`
- SOP skills live in the same user-level `~/.sasiki` area as `chrome_profile` and `cookies`.
- refine loads all SOP skill frontmatter metadata by default at startup.
- refine can still run in all three cases:
  - prompt only
  - SOP only
  - prompt plus SOP
- refine gets a dedicated tool for loading a selected SOP body on demand.
- CLI exposes a management surface for listing the available SOP skills.
- the design keeps room for a later planner-like step without making planner logic part of this pass.

## Non-Goals

- No automatic planner stage in this pass.
- No semantic conflict resolution engine between prompt and SOP body in this pass.
- No fuzzy or heuristic SOP reranking runtime owned by the host in this pass.
- No site-specific hardcoded SOP selection rules.
- No hidden fallback that silently ignores missing SOP content.
- No requirement that this pass fully replace `run_id` references everywhere on day one.
- No full sandboxed file browser in this pass; only a narrow SOP body reader tool is required now.

## Chosen Direction

Treat `sop-compact` as the workflow that mints a reusable SOP skill from:

- an `observe` trace
- human clarification from a dedicated HITL-only compact agent
- the user's own explanation of what the workflow is for

The compact agent should stop behaving like a heuristic workflow patch builder and instead behave like a workflow-understanding agent whose job is:

1. understand what the user was trying to do in the observed workflow
2. use HITL to clarify task intent, applicable boundary, and success judgement
3. write back a better reusable description of that workflow
4. persist it as a named user-level SOP skill

This keeps the compact stage centered on task understanding and reusable documentation rather than local selector cleanup or heuristic step buckets.

## Product Shape

Each SOP skill should follow the existing skill file pattern exactly: one markdown file with YAML frontmatter at the top and markdown body below it.

### Layer 1: YAML Frontmatter

This is the lightweight metadata refine always loads by default.

It should follow the same top-of-file frontmatter shape used by existing skills. At minimum it must contain:

- `name`
- `description`

Additional fields may be added if needed for provenance or future routing, but the default startup load in this pass should rely only on `name` and `description`.

This frontmatter acts like the always-available skill index. It should stay compact enough to load for every refine run.

### Layer 2: Markdown Body

This is the long-form natural-language body.

It should read like an existing `SKILL.md` rather than like a rigid structured schema. It does not need forced sections, but it should naturally include:

- the more precise task goal
- the high-level flow the user performed during observe
- the important details that were implicit in the demonstration
- the judgment signals for completion or correctness
- caveats or scope boundaries that matter for reuse

This document is the main place where observed execution detail gets folded back into a richer reusable task description.

## User-Level Storage

SOP skills should become user-level state, not just run-local artifacts.

The default home for this pass is:

- `~/.sasiki/skills/`

This keeps SOP skills colocated with the existing user-level browser state:

- `~/.sasiki/chrome_profile`
- `~/.sasiki/cookies`

### Storage Layout

Each named SOP should have its own directory under the root, and that directory should contain one canonical skill file.

An example layout is:

- `~/.sasiki/skills/<skill-name>/SKILL.md`

The `SKILL.md` file should contain both:

- YAML frontmatter for lightweight metadata loading
- markdown body for on-demand detailed loading

There should be no separate `index.json` or `metadata.json` requirement in this design. Skill discovery should come from scanning the skill directories and parsing each `SKILL.md` frontmatter.

## Naming Model

`run_id` can remain the provenance key for the compact input, but it should stop being the main user-facing way to reference the result.

The durable user-facing handle should be a stable skill name.

This pass should support:

- compact generates a named SOP skill from a source observe run
- refine can reference an SOP by name
- provenance still records the original source run id

If the user does not explicitly supply a name during compact creation, the compact HITL flow may propose one and confirm it with the user.

## Refine Consumption Model

Refine should consume SOP knowledge in two layers.

### Default Startup Load

At refine bootstrap:

- scan the SOP skill directories
- parse each `SKILL.md` frontmatter
- inject them into the refine start context as a bank of available SOP skills

This metadata bank should behave like a persistent skill index that gives the agent awareness of the available reusable workflows.

This load should happen even if the user did not explicitly reference a particular SOP.

### On-Demand Body Load

Refine should not load every detailed SOP document into the start prompt.

Instead, refine gets a dedicated tool, tentatively named `skill.reader`, whose only job in this pass is:

- list available skill names if needed
- load the detailed markdown body for one selected SOP skill

This keeps the startup context bounded while still allowing the agent to fetch the full document once it identifies the relevant SOP.

This tool is the narrow precursor to a possible future sandbox file-reading capability, but this pass should keep it scoped to SOP skill bodies only.

## Request Semantics

Refine should remain valid when any one source of task context is missing.

### Prompt Only

If the user supplies only a live prompt:

- refine runs normally
- SOP metadata bank is still loaded in the background
- the agent may later load a detailed SOP body if needed

### SOP Only

If the user specifies only a named SOP:

- refine should still run
- the named SOP becomes the main task-understanding source
- detailed body loading should happen explicitly and early

### Prompt Plus SOP

If the user supplies both:

- treat them as complementary by default
- do not assume conflict
- allow future planner-style disambiguation, but do not require it in this pass

If the user references a named SOP that does not exist, refine should fail explicitly.

## Compact Workflow Changes

The active behavior of `sop-compact` should change from local convergence around `workflowSkeleton`, `actionPolicy`, and similar compact fields into a more direct documentation-oriented output.

The compact agent for this pass should have only one human-facing tool role:

- `hitl`

Its main behavior should be:

- read the observe trace summary
- ask the user what the workflow was really meant to accomplish
- clarify important intent gaps one question at a time
- write out:
  - the YAML frontmatter with `name` and `description`
  - the detailed `SKILL.md` body
  - the chosen skill name

The current compact internals may be reused temporarily during migration, but the product truth should no longer be described as a heuristic workflow patch session.

## CLI Surface

The CLI should grow an SOP skill management surface.

This pass only requires a minimal management interface, not a full management suite.

At minimum, the CLI should support listing the available SOP skills so the user can see what is installed.

A concrete command spelling can be chosen during implementation, but it should cover:

- list available SOP skills
- show stable user-facing names from frontmatter
- optionally show short descriptions from frontmatter

Example shapes that fit the intent:

- `sop-compact list`
- `skills list`
- `refine --list-skills`

The exact command grammar is secondary. The required behavior is that the system exposes discoverability for named SOP skills.

## Architecture Invariants

- `sop-compact` remains the only workflow that turns observe traces into durable SOP skills.
- `refine` remains the only high-decision execution agent; host/runtime must not silently choose or apply SOPs on the agent's behalf.
- default frontmatter loading must stay lightweight and deterministic.
- detailed SOP body loading must happen through an explicit tool call, not by silently inlining all documents into startup prompts.
- missing or invalid referenced SOP content must fail explicitly.
- provenance from SOP skill back to observe run must remain preserved.

## Data Model Direction

This pass should introduce a durable SOP skill file distinct from the current `CompactCapabilityOutput`.

The exact TypeScript names can be finalized in implementation, but the persisted document should conceptually contain:

- frontmatter:
  - `name`
  - `description`
  - optional provenance or routing fields such as `sourceObserveRunId`, `createdAt`, `updatedAt`, `site`, `aliases`, or `tags`
- markdown body:
  - the long-form SOP skill content

The default loader in this pass should only depend on `name` and `description`. Extra frontmatter fields are allowed, but they should not become required for baseline refine startup.

The current `CompactCapabilityOutput` can remain as a transitional internal artifact if that helps incremental migration, but it should stop being the front-door product truth for refine consumption.

## Migration Strategy

The implementation should be incremental.

### Phase 1

- keep current `sop-compact --run-id <run_id>` entry
- after compact completes, persist a named `SKILL.md` under the user-level store
- add CLI list support

### Phase 2

- refine bootstrap loads all SOP `SKILL.md` frontmatter
- refine request surface accepts a named SOP reference
- add the on-demand `skill.reader` tool for SOP bodies

### Phase 3

- reduce reliance on the old compact capability output as the main product artifact
- keep `run_id` mainly for provenance and migration compatibility

This staging lets the chain run end to end before any planner or broader sandbox file-reading work is introduced.

## Failure Policy

- If refine is asked to use a named SOP that does not exist, fail explicitly.
- If a referenced SOP body cannot be read, fail explicitly.
- If frontmatter loading at startup is declared part of the active bootstrap contract and it breaks, fail explicitly rather than silently starting with partial hidden state.
- If compact cannot produce a valid `SKILL.md` with `name`, `description`, and body content, it should not claim success.

## Acceptance

- A new design-backed durable SOP skill format exists under the user-level `~/.sasiki/skills/` root.
- `sop-compact` can produce a named SOP skill from an observe run plus HITL clarification.
- the stored SOP skill is a `SKILL.md` file with YAML frontmatter and markdown body.
- refine bootstrap loads all `name` and `description` frontmatter by default.
- refine can run with prompt only, SOP only, or prompt plus SOP.
- refine has an explicit tool for loading the detailed body of one SOP.
- CLI can list available SOP skills.
- provenance from each SOP skill back to its source observe run is preserved.

## Deferred Decisions

- Whether the future planner should explicitly compare prompt and SOP metadata before first action.
- Whether the future `skill.reader` should expand into a general sandboxed read-file capability.
- Whether the long-term storage root should stay `~/.sasiki/skills/` or narrow further to a more specialized SOP-only subdirectory.
- Whether refine should eventually auto-select candidate SOPs beyond loading the metadata bank by default.
