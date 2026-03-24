---
doc_type: spec
status: completed
supersedes: []
related:
  - docs/testing/refine-e2e-baidu-search-runbook.md
  - docs/testing/refine-e2e-tiktok-shop-customer-service-runbook.md
  - apps/agent-runtime/src/application/refine/prompt-provider.ts
  - apps/agent-runtime/src/application/refine/system-prompts.ts
  - apps/agent-runtime/src/application/refine/tools/definitions/
---

# Refine TikTok Customer Service E2E Design

## Problem

The current refine baseline is still biased toward a lightweight Baidu smoke task, while the real product goal is a higher-context customer-service workflow. When we run refine against TikTok Global Shop customer service, the agent can eventually recover, but it still shows avoidable confusion:

- it may keep querying a stale snapshot after a page-changing action until it self-corrects
- bootstrap already captures an initial observation, but the start prompt does not expose that observationRef or page identity explicitly
- tool descriptions do not state strongly enough that `observe.query` is snapshot-only and that `act.navigate` / `act.select_tab` require a fresh `observe.page` before the next structural step
- when the inbox is truly empty, the agent can hesitate instead of treating the verified empty state as a valid completion

## Success

- TikTok Global Shop customer-service check becomes the active refine e2e baseline for prompt and tool-surface tuning.
- The start prompt explicitly exposes the bootstrap observationRef plus page identity.
- Prompt guidance and tool descriptions both state the re-observe rule after page-changing actions and tab switches.
- Prompt guidance explicitly treats a verified empty inbox / queue state as a valid completion path.
- A fresh TikTok customer-service refine run completes with evidence under `artifacts/e2e/<run_id>/`.
- The improved run materially reduces stale-snapshot confusion and redundant closeout behavior versus the first baseline attempt.

## Out Of Scope

- No redesign of refine tool behavior beyond prompt/tool-description semantics.
- No new browser tools or schema shape changes.
- No heuristic queue summarizer outside the agent loop.

## Critical Paths

1. Capture the TikTok customer-service task as a written runbook and active baseline.
2. Pass the bootstrap observation into the start prompt instead of hiding it.
3. Harden prompt/tool wording around re-observe requirements and empty-state completion.
4. Re-run the TikTok workflow and verify the new guidance against fresh evidence.

## Frozen Contracts

- `observe.page` remains the only fresh-snapshot minting path.
- `observe.query` stays deterministic and snapshot-scoped.
- `act.navigate` / `act.select_tab` stay thin actions and do not mint observation refs.
- `run.finish(reason, summary)` remains the explicit completion marker.

## Architecture Invariants

- Prompt changes must stay inside refine-owned prompt/bootstrap code.
- Tool-description changes must stay inside refine tool definitions; they must not add hidden behavioral fallbacks.
- Empty-state handling should be clarified through agent guidance, not by hardcoding special TikTok business logic in runtime.

## Failure Policy

- If the active page or tab changes and the agent has not re-observed, the prompt should bias toward explicit re-observation rather than guessing.
- If the inbox is empty after checking the relevant views, the run should finish with an evidence-backed summary rather than continue speculative searching.

## Acceptance

- `docs/testing/refine-e2e-tiktok-shop-customer-service-runbook.md` exists and matches the active task.
- Prompt/bootstrap tests cover the initial observation block.
- Tool-surface tests cover the hardened descriptions.
- Fresh TikTok customer-service run evidence is recorded.
- Evidence shows the agent re-observes correctly after navigation/tab changes and can finish on a verified empty inbox.

## Deferred Decisions

- Whether to later add task-class-specific prompt modules for inbox triage vs. generic navigation tasks.
- Whether to later ratchet down unnecessary knowledge recording on empty-state runs.
