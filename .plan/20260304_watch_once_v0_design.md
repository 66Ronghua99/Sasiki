# Watch-Once V0 Design Draft (2026-03-04)

## 0. Review Input Snapshot
Based on user decisions in this review round:
- Priority is `Watch-Once v0` (not Xiaohongshu-only optimization).
- Use multiple non-sensitive sites for validation (`Baidu + Douyin/TikTok + Xiaohongshu`).
- V0 output must be saved as reusable files that can be repeatedly indexed/retrieved, similar to skill assets.
- Record raw user input/content as-is for V0; defer sensitive-data handling.
- No fixed retention period for now.
- Scope V0 to single-tab; multi-tab goes to V1.
- Xiaohongshu is a sample target, not the only product goal.
- SOP asset root directory is fixed to `~/.sasiki/sop_assets/`.
- V0 must support asset consumption with natural-language guide and web element hints fallback.

---

## 1. Problem Statement
Current runtime can execute agent tasks but cannot learn browser SOP from user demonstration.
This blocks the strategic goal: `Watch Once -> Learn -> Optimize`.

### Constraints
- Keep current `run` path backward-compatible.
- Minimize architecture changes; prioritize smallest usable loop.
- Avoid sensitive websites in V0 validation.
- V0 focuses on single-tab capture.

### Non-goals (V0)
- Full multi-tab/session graph capture.
- Security hardening (masking/redaction policy engine).
- Enterprise collaboration scenarios (e.g., Feishu mainline support).
- Fully autonomous replay optimizer.

---

## 2. Boundary & Ownership

## 2.1 Module Ownership
- `apps/agent-runtime/src/index.ts`
  - Own CLI mode selection (`run` vs `observe`).
- `apps/agent-runtime/src/runtime/agent-runtime.ts`
  - Own `observe` orchestration lifecycle (start browser, record, flush artifacts).
- `apps/agent-runtime/src/infrastructure/browser/*-demonstration-recorder.ts`
  - Own raw user interaction capture from browser context.
- `apps/agent-runtime/src/core/sop-demonstration-recorder.ts`
  - Own event normalization and step extraction.
- `apps/agent-runtime/src/domain/sop-trace.ts`
  - Own canonical trace contract (single source of truth).
- `apps/agent-runtime/src/runtime/artifacts-writer.ts`
  - Own run-local artifact persistence.
- `apps/agent-runtime/src/runtime/sop-asset-store.ts` (new)
  - Own reusable SOP asset indexing and retrieval metadata.

## 2.2 Dependency Direction
`infrastructure capture -> core normalization -> domain schema -> runtime persistence/index`

No reverse dependency from `core/domain` to browser-specific adapters.

## 2.3 Single Source of Truth
`demonstration_trace.json` is the canonical machine-readable SOP trace.
Other outputs (`sop_draft.md`, raw jsonl) are derivative views.

---

## 3. Demonstration Trace Definition (V0)

`demonstration trace` = time-ordered structured action sequence captured from one user demonstration in one tab, with enough context for agent consumption and later retrieval.

### 3.1 Artifact Set
- `demonstration_raw.jsonl`
  - Raw captured events (low-level, append-only, debug-friendly).
- `demonstration_trace.json`
  - Canonical normalized steps (machine contract, stable keys).
- `sop_draft.md`
  - Human-readable SOP summary generated from trace.
- `sop_asset.json`
  - Reuse metadata (tags/site/task/version/path pointers), natural-language guide path, and web element hints.

### 3.2 Proposed Trace Contract (minimal)
```json
{
  "traceVersion": "v0",
  "traceId": "20260304_223000_001",
  "mode": "observe",
  "site": "baidu.com",
  "singleTabOnly": true,
  "taskHint": "搜索关键词并打开目标结果",
  "steps": [
    {
      "stepIndex": 1,
      "timestamp": "2026-03-04T14:30:00.000Z",
      "action": "navigate",
      "target": { "type": "url", "value": "https://www.baidu.com" },
      "input": {},
      "page": { "urlBefore": "about:blank", "urlAfter": "https://www.baidu.com" },
      "assertionHint": { "type": "title_contains", "value": "百度" },
      "rawRef": "event-0001"
    }
  ]
}
```

### 3.3 Action Vocabulary (V0)
- `navigate`
- `click`
- `type`
- `press_key`
- `scroll`
- `wait`

---

## 4. Options & Tradeoffs

## 4.1 Output Model
- Option A (Chosen): Structured trace first + readable SOP draft.
  - Pros: deterministic, indexable, directly consumable by agent.
  - Cons: requires schema design and normalizer logic.
- Option B: Natural-language SOP only.
  - Rejected: weak determinism, poor replay consistency.
- Option C: Video/screenshot timeline as primary artifact.
  - Rejected: heavy storage, hard machine execution.

## 4.2 Capture Strategy
- Option A (Chosen): Playwright-level event capture + injected listeners.
  - Pros: faster delivery, less protocol complexity, enough for V0.
  - Cons: misses some deep browser protocol nuances.
- Option B: Full CDP low-level stream capture.
  - Rejected for V0: high complexity, slows first closed loop.

## 4.3 Scope Strategy
- Option A (Chosen): single-tab strict V0.
  - Pros: stable first loop, lower implementation risk.
  - Cons: limited workflow coverage.
- Option B: include multi-tab in V0.
  - Rejected: expands edge cases and delays delivery.

---

## 5. Migration Plan

## Step 1: Freeze Contracts
- Add `domain/sop-trace.ts` and `domain/sop-asset.ts`.
- Freeze minimal schema keys and versioning (`traceVersion: v0`).

Rollback point:
- Keep schema local to new files; no impact to `run` mode.

## Step 2: Add Observe Mode
- Extend CLI with `--mode observe`.
- Add `AgentRuntime.observe(taskHint)` entry.

Rollback point:
- Default mode remains `run`; observe path can be disabled independently.

## Step 3: Capture Raw Events
- Implement browser recorder adapter for single-tab user interactions.
- Persist `demonstration_raw.jsonl`.

Rollback point:
- If capture is unstable, keep observe mode but write only navigation/type/click core events.

## Step 4: Normalize Trace
- Transform raw events into canonical `demonstration_trace.json`.
- Enforce deterministic step ordering and stable action vocabulary.

Rollback point:
- Keep raw events; bypass normalization on failure and mark run as `observe_failed`.

## Step 5: Generate SOP Draft + Asset Metadata
- Emit `sop_draft.md` and `sop_asset.json`.
- Add lightweight local index (json file) under `~/.sasiki/sop_assets/` for retrieval by `site/tags/taskHint`.

Rollback point:
- If indexing has issues, keep per-run assets and skip global index update.

## Step 6: Agent Consumption Path (V0 minimum)
- Support loading a selected SOP asset and converting to agent-understandable instruction context.
- Require output of natural-language execution guide plus web element hints for fallback when direct operation fails.
- No full deterministic replay engine in V0.

Rollback point:
- Keep artifact generation only; defer consumption to V0.1.

## Step 7: Validation on Multi-site Samples
- Validate with:
  - Baidu (low complexity baseline)
  - Douyin or TikTok public flow (medium complexity)
  - Xiaohongshu public flow (medium-high complexity)
- Feishu remains out of V0 acceptance.

---

## 6. Test Strategy

## 6.1 Unit Tests
- Trace schema validation (required fields, order, type).
- Normalization rules (dedupe/merge for repeated input/scroll).
- Asset metadata generation and index insertion.

## 6.2 Integration Tests
- `observe` mode creates all V0 artifacts.
- Existing `run` mode remains unaffected.
- Load SOP asset and produce agent-consumable context successfully.

## 6.3 Manual E2E Validation Matrix
- Site A (Baidu): search keyword and open result page.
- Site B (Douyin/TikTok): search keyword and open target content page.
- Site C (Xiaohongshu): search keyword and open first visible post.

### Acceptance Standard (V0)
1. For each site, at least one demonstration run generates all artifacts:
   - `demonstration_raw.jsonl`
   - `demonstration_trace.json`
   - `sop_draft.md`
   - `sop_asset.json`
2. At least one SOP asset per site can be loaded and transformed into agent-consumable execution context.
3. Existing runtime gate commands still pass:
   - `npm --prefix apps/agent-runtime run typecheck`
   - `npm --prefix apps/agent-runtime run build`

---

## 7. Risks & Mitigation
- Risk: No redaction in V0.
  - Mitigation: strict non-sensitive-site policy for validation.
- Risk: Index growth with no retention period.
  - Mitigation: add manual prune command in V1.
- Risk: Cross-site variability reduces trace quality.
  - Mitigation: start from constrained action vocabulary and explicit schema versioning.

---

## 8. Open Review Items
1. Resolved: validation target uses `Douyin or TikTok` for site B.
2. Resolved: SOP asset root path fixed as `~/.sasiki/sop_assets/`.
3. Resolved: V0 acceptance requires asset consumption with natural-language guide and web element hints.
