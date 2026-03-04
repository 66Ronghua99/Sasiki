# Prompt & Reasoning Observability Upgrade (2026-03-04)

## 1. Problem Statement
Current browser runs show two gaps:
- Prompt is too generic, so tool use quality degrades into ad-hoc `browser_run_code` exploration.
- We persist `steps/mcp_calls/runtime.log`, but we do not persist assistant reasoning/thinking per turn.

Constraints:
- We should improve adaptation quality, not lock behavior into rigid constraints.
- Keep backward compatibility for existing runtime execution and artifacts.
- Reasoning output must be optional/configurable because model/provider support differs.

Non-goals:
- Replacing `pi-agent-core` loop.
- Large policy engine or hard-coded domain selectors.

## 2. Boundary & Ownership
- `src/core/agent-loop.ts`
  - Owns system prompt and agent event collection.
  - Owns thinking level application (`Agent.setThinkingLevel`).
- `src/runtime/runtime-config.ts`
  - Owns config parsing/normalization (`llm.thinkingLevel`).
- `src/domain/agent-types.ts`
  - Owns run result schema (`assistantTurns`).
- `src/runtime/artifacts-writer.ts`
  - Owns artifact persistence (`assistant_turns.json`).
- `src/runtime/agent-runtime.ts`
  - Owns end-to-end orchestration and artifact write order.

Single source of truth:
- Runtime behavior knobs come from `RuntimeConfigLoader` normalized `RuntimeConfig`.
- Assistant thought records come from `message_end` assistant messages.

## 3. Options & Tradeoffs
Option A: Prompt-only improvement
- Pros: smallest change.
- Cons: no observability of reasoning quality; hard to debug/learn SOP.
- Rejected: does not satisfy the reasoning-output objective.

Option B: Add prompt + configurable thinking + assistant turn artifact (chosen)
- Pros: better instruction quality + traceability; supports future SOP extraction.
- Cons: extra artifact size and token/cost risk when thinking enabled.
- Mitigation: thinking level configurable and can be set to `off`.

Option C: Add strict tool policy guardrails and hard failure rules now
- Pros: immediate local stability.
- Cons: over-constrains behavior, risks local optimum and poorer generalization.
- Rejected for now per product direction.

## 4. Migration Plan
1. Add `thinkingLevel` to runtime config model, parser, and env support (`LLM_THINKING_LEVEL`).
2. Upgrade system prompt to identity/capability/operating loop style.
3. In agent loop, apply `setThinkingLevel` and collect assistant message records at `message_end`.
4. Persist `assistant_turns.json` in run artifacts and expose via run result.
5. Keep existing fields/artifacts unchanged for backward compatibility.

Rollback points:
- Set `thinkingLevel=off` in config/env to disable reasoning output without code rollback.
- Revert prompt constant and assistant artifact write methods if needed.

## 5. Test Strategy
Unit/static checks in this repo:
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`

Acceptance checks:
- Run one task and verify new artifact `assistant_turns.json` exists under run directory.
- Verify each assistant turn includes `text/thinking/toolCalls/stopReason` fields.
- Verify existing artifacts remain: `steps.json`, `mcp_calls.jsonl`, `runtime.log`, `final.png`.
