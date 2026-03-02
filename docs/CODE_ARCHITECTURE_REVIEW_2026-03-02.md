# Sasiki Code Architecture Review (2026-03-02)

## 1. Review Scope

This review focuses on maintainability and upgrade complexity, not feature correctness.

Reviewed areas:

- `engine/` (execution core)
- `server/` (WebSocket protocol and runtime)
- `workflow/` (modeling and generation)
- `commands/` (CLI orchestration)
- `config/logger` (bootstrap and side effects)

## 2. Method

Signals used:

- Static code reading with line-level evidence
- Lint/type baseline checks
  - `uv run ruff check src tests` -> many style/consistency findings
  - `uv run mypy src` -> strict typing currently fails across key modules

Interpretation rule:

- Findings are prioritized by how much they increase future change cost and coupling.

## 3. Quick Architecture Snapshot

Current architecture works for local single-user iteration, but has three structural pressure points:

1. Orchestration overload in `WorkflowRefiner` (too many responsibilities in one class)
2. Protocol abstraction drift (declared model vs actual dict/string handling)
3. Weak quality gates (strict mypy configured, but not currently passable)

These three together make future upgrades risky: any medium change tends to touch multiple layers at once.

## 4. Detailed Findings

## F1. `WorkflowRefiner` responsibility overload (High)

Location:

- `src/sasiki/engine/workflow_refiner.py:84`
- `src/sasiki/engine/workflow_refiner.py:272`
- `src/sasiki/engine/workflow_refiner.py:456`
- `src/sasiki/engine/workflow_refiner.py:688`
- `src/sasiki/engine/workflow_refiner.py:737`

What was written:

- One class handles end-to-end flow:
  - Plan generation
  - Browser lifecycle
  - Stage loop
  - Step retry policy
  - HITL conversion and decision mapping
  - Checkpoint handling
  - Final artifact persistence

Why this creates a problem:

- Cross-cutting concerns are merged.
- A small policy change (for example retry behavior) may require edits in stage loop + HITL branch + result aggregation.
- Cognitive load is high because behavior is distributed across long methods and repeated branches.

Impact:

- Slower onboarding and harder regression isolation.
- Refactors are likely to alter behavior unintentionally.

Suggested split:

- `StageExecutor` (single-stage step loop + retry)
- `CheckpointCoordinator`
- `HITLDecisionMapper`
- `RefineArtifactWriter`
- Keep `WorkflowRefiner` as a thin orchestrator.

---

## F2. Repeated control-flow branches in `run()` (Medium)

Location:

- `src/sasiki/engine/workflow_refiner.py:175`
- `src/sasiki/engine/workflow_refiner.py:194`
- `src/sasiki/engine/workflow_refiner.py:216`
- `src/sasiki/engine/workflow_refiner.py:230`

What was written:

- Same “mark remaining stages as skipped” branch appears multiple times for `failed`, `paused`, and checkpoint outcomes.

Why this creates a problem:

- Repetition increases divergence risk.
- Future status type addition requires updating many branches manually.

Impact:

- Status behavior becomes fragile and harder to reason about.

Suggested change:

- Extract helper such as `_append_skipped_tail(stages, start_index)`.
- Prefer a centralized state-transition helper for final status and tail handling.

---

## F3. Protocol abstraction is declared but bypassed at runtime (High)

Location:

- `src/sasiki/server/websocket_protocjol.py:197`
- `src/sasiki/server/websocket_server.py:85`
- `src/sasiki/commands/record.py:43`

What was written:

- `WSMessage` and typed message constructors exist.
- Runtime still uses raw JSON dicts and string-based branching.

Why this creates a problem:

- Two protocol sources of truth:
  - Typed model in `websocket_protocol.py`
  - Ad-hoc message shape in command/server code
- Message schema evolution can silently drift.

Impact:

- Breakages are found late (runtime), not early (model validation).

Suggested change:

- Introduce a single message codec:
  - Parse incoming raw JSON -> validated typed message
  - Build outgoing payloads from typed constructors
- Remove direct ad-hoc dict construction from command/server paths.

---

## F4. Role and message policy not modeled as first-class strategy (High)

Location:

- `src/sasiki/server/websocket_server.py:95`
- `src/sasiki/server/websocket_server.py:108`
- `src/sasiki/server/websocket_server.py:113`

What was written:

- Client role (`extension`/`cli`) is tracked but not enforced as an explicit policy matrix.
- Message handling remains mostly type-based.

Why this creates a problem:

- Access rules are implicit in control flow.
- Hard to audit or extend when adding new client types and message types.

Impact:

- Increased bug/security risk when protocol grows.

Suggested change:

- Add `message_policy.py` mapping:
  - role -> allowed message types
  - message type -> permitted payload schema
- Reject invalid role/message combinations before business handlers.

---

## F5. Workflow model has dual action representations with weak contract (Medium)

Location:

- `src/sasiki/workflow/models.py:44`
- `src/sasiki/workflow/models.py:45`
- `src/sasiki/workflow/models.py:133`
- `src/sasiki/engine/workflow_refiner.py:763`

What was written:

- Stage stores both:
  - `actions: list[str]`
  - `action_details: list[dict]`
- Execution plan currently resolves only text `actions`.

Why this creates a problem:

- Runtime behavior depends on lossy text form.
- Rich structured data is preserved but not consistently used by execution.

Impact:

- Future move to deterministic replay or stable locator replay becomes costly.
- Inconsistent semantics between generated workflow and executed workflow.

Suggested change:

- Promote structured action details to primary execution input.
- Keep text actions as display-only derived representation.

---

## F6. Configuration and logger bootstrapping have import-time side effects (Medium)

Location:

- `src/sasiki/config.py:91`
- `src/sasiki/config.py:99`
- `src/sasiki/utils/logger.py:42`
- `src/sasiki/cli.py:13`
- `src/sasiki/server/websocket_server.py:321`

What was written:

- `settings = Settings()` at import time.
- `Settings.__init__` creates directories.
- `logger = configure_logging()` at import time.
- CLI and standalone server also configure logging explicitly.

Why this creates a problem:

- Importing modules mutates environment (filesystem/logging state).
- Makes tests harder to isolate and entrypoint behavior less predictable.

Impact:

- Harder to embed as library.
- Double/competing logger configuration risk.

Suggested change:

- Replace global eager init with lazy accessors:
  - `get_settings()`
  - `configure_logging_once()`
- Entrypoints call bootstrap explicitly; library import remains side-effect free.

---

## F7. Quality gate mismatch: strict mypy configured, but codebase not passing (High)

Location:

- `pyproject.toml:63`
- Representative failures:
  - `src/sasiki/engine/replay_models.py:7`
  - `src/sasiki/engine/page_observer.py:121`
  - `src/sasiki/llm/client.py` (multiple overload/Any issues)

What was written:

- `mypy` strict mode is enabled in project config.
- Current source still contains broad `Any`, missing annotations, and typing inconsistencies.

Why this creates a problem:

- Team believes strict type safety exists, but gate is effectively non-operational.
- Silent regressions accumulate.

Impact:

- Refactor confidence is low.
- Harder to safely evolve internal APIs.

Suggested change:

- Restore gate in phases:
  - `src/` first, then tests
  - block new type debt once baseline is green
- Introduce per-module typing budgets if full fix is not immediate.

---

## F8. Lint consistency debt is high (Medium)

Location:

- Whole codebase (`ruff` output indicates many issues, many auto-fixable)
- `pyproject.toml:58` warns deprecated top-level lint config style

What was written:

- Formatting/import/unused patterns are inconsistent across modules.
- Many command/test files show avoidable style and dead-code warnings.

Why this creates a problem:

- Noise masks real problems in review.
- Inconsistent style slows comprehension and patch review.

Impact:

- Team velocity tax during every change.

Suggested change:

- Run `ruff --fix` in controlled batches by directory.
- Move `tool.ruff` options to modern `lint.*` keys.
- Enforce lint in CI.

---

## F9. Command layer repeats common logic (Low)

Location:

- `src/sasiki/commands/run.py:14`
- `src/sasiki/commands/refine.py:23`
- `src/sasiki/commands/generate.py:15`
- `src/sasiki/commands/workflows.py:16`

What was written:

- Multiple `_print_header()` copies.
- Repeated workflow resolution by UUID/name.
- Repeated variable prompt/validation flow.

Why this creates a problem:

- Small UX or behavior changes require multi-file edits.
- Drift appears quickly between commands.

Impact:

- Higher maintenance cost and inconsistent CLI behavior over time.

Suggested change:

- Extract shared command helpers:
  - `commands/ui.py` for header/panels
  - `commands/workflow_inputs.py` for workflow loading and variable collection.

---

## F10. `LLMClient` mixes transport + prompt task helpers (Medium)

Location:

- `src/sasiki/llm/client.py:29`
- `src/sasiki/llm/client.py:99`
- `src/sasiki/llm/client.py:159`

What was written:

- Same class contains:
  - Generic completion transport
  - Legacy domain-specific prompt assembly methods

Why this creates a problem:

- Class responsibility boundary is blurred.
- Typed SDK integration and task logic evolve together, causing merge friction.

Impact:

- Harder to swap provider or adapt API options cleanly.

Suggested change:

- Keep `LLMClient` as transport-only abstraction.
- Move task-specific prompt logic to dedicated service modules.
- Remove dead/unused methods after verification.

---

## F11. `page_observer` return contract is semantically inconsistent (Medium)

Location:

- `src/sasiki/engine/page_observer.py:49`
- `src/sasiki/engine/page_observer.py:121`

What was written:

- `_compress_tree` type says `Optional[Dict[str, Any]]` but implementation may return `list`.

Why this creates a problem:

- Static typing and runtime shape expectations diverge.
- Consumers need defensive programming or implicit assumptions.

Impact:

- Type safety weakened at a core data boundary.

Suggested change:

- Define explicit union type alias for compressed node.
- Normalize return shape if possible (for example always list root or always object with `children`).

---

## F12. WebSocket runtime currently assumes single-slot clients (Medium for future scale)

Location:

- `src/sasiki/server/websocket_server.py:42`
- `src/sasiki/server/websocket_server.py:43`

What was written:

- Server keeps one `extension_ws` and one `cli_ws`.

Why this creates a problem:

- No natural scaling path for multi-session or multi-observer scenarios.
- Any move to team/shared environment requires redesign in state model.

Impact:

- Future feature additions (parallel sessions, monitoring clients) become invasive.

Suggested change:

- Introduce session-scoped connection registry:
  - `session_id -> {role -> connection(s)}`
- Keep current behavior as compatibility mode.

## 5. Structural Risks for Future Upgrades

If unchanged, these are likely upgrade pain points:

1. Adding new WebSocket message types will require touching many ad-hoc dict paths.
2. Adjusting retry/HITL behavior will repeatedly modify `WorkflowRefiner` internals.
3. Improving replay determinism will conflict with text-only action plan execution.
4. Turning on strict CI quality gates later will create large “big bang” cleanup cost.

## 6. Recommended Refactor Sequence (Low-Risk Path)

1. Restore quality baseline (`ruff` + `mypy`) in incremental batches.
2. Unify protocol parsing/building and role-message policy.
3. Split `WorkflowRefiner` by responsibility.
4. Promote structured action details to execution primary input.
5. Deduplicate command-layer shared logic.

## 7. Suggested Learning/Review Focus

For code structure learning, study these files in order:

1. `engine/workflow_refiner.py` (shows orchestration complexity accumulation)
2. `server/websocket_protocol.py` + `server/websocket_server.py` (model vs runtime drift)
3. `workflow/models.py` + `workflow/skill_generator.py` (data representation choices and downstream effects)
4. `config.py` + `utils/logger.py` (bootstrap side-effect patterns)

## 8. Appendix: Baseline Signals

Current baseline observed during this review:

- `ruff`: large number of issues (many fixable automatically)
- `mypy`: strict mode enabled, currently failing in multiple modules

This is not a blocker for local experiments, but it is a blocker for long-term safe refactoring at scale.
