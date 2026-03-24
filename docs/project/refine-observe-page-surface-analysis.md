# Refine `observe.page` Surface Analysis

## Purpose

This note explains what the refine agent actually sees through `observe.page`, how that view is produced across layers, and where information can be lost before the agent reasons over it.

The goal is to separate four different questions that are easy to mix together:

1. What does Playwright MCP actually return?
2. What does the Sasiki adapter parse or preserve?
3. What can `observe.query` deterministically search?
4. What does the agent end up reasoning over in a real run?

## End-To-End Surface Map

| Layer | Source | Shape | What is preserved | What is dropped / not added | Current owner |
| --- | --- | --- | --- | --- | --- |
| Raw browser snapshot | MCP `browser_snapshot` | Markdown text with sections like `Open tabs`, `Page`, `Snapshot`, sometimes `Events` | Full raw text, including tab list, page section, YAML-like accessibility tree, console/event lines | No explicit structured JSON from MCP; if a thing is absent in markdown, upper layers cannot recover it | `@playwright/mcp` via `browser_snapshot` |
| Adapter metadata parsing | `RefineBrowserSnapshotParser.parseObservationMetadata(...)` | `page`, `tabs`, `activeTabIndex`, `activeTabMatchesPage` | Tab identities, active tab, page identity, active-tab preference when `Page URL` is stale | No waiting/retry/stability policy; no semantic segmentation of header/body; no extra DOM/API fetch | [refine-browser-snapshot-parser.ts](/Users/cory/codes/Sasiki-dev-refine-observe-surface/apps/agent-runtime/src/application/refine/refine-browser-snapshot-parser.ts) |
| Stored observation contract | `ObservePageResponse` / `PageObservation` | `observationRef`, `page`, `tabs`, `activeTabIndex`, `activeTabMatchesPage`, `snapshot`, `capturedAt` | Raw snapshot plus parsed page/tab metadata | No parsed element tree, no visibility scores, no section labels, no stable regions, no screenshot link | [refine-react.ts](/Users/cory/codes/Sasiki-dev-refine-observe-surface/apps/agent-runtime/src/domain/refine-react.ts) |
| Deterministic query layer | `observe.query` over parsed snapshot lines | `matches[]` with `elementRef`, `role`, `rawText`, `normalizedText` | Elements from YAML or legacy lines that contain `[ref=...]` | Lines without `ref`, console/events, page/tabs sections, and any free-form semantic inference | [refine-browser-service.ts](/Users/cory/codes/Sasiki-dev-refine-observe-surface/apps/agent-runtime/src/application/refine/tools/services/refine-browser-service.ts) |
| Agent reasoning layer | Model prompt + tool outputs | Natural-language reasoning over tool payloads | Whatever the model notices from `snapshot`, `page`, `tabs`, and prior actions | No runtime-side attention guidance beyond current prompt/tool descriptions | refine prompt + model behavior |

## What `observe.page` Does Today

### Runtime path

`observe.page` is currently a thin wrapper:

1. Call raw MCP tool `browser_snapshot`
2. Read first text block from the tool result
3. Parse page/tab metadata from that text
4. Store the raw snapshot string as `observation.snapshot`
5. Mint `observationRef`

Relevant code:

- [observe-page-tool.ts](/Users/cory/codes/Sasiki-dev-refine-observe-surface/apps/agent-runtime/src/application/refine/tools/definitions/observe-page-tool.ts)
- [refine-browser-service.ts#L66](/Users/cory/codes/Sasiki-dev-refine-observe-surface/apps/agent-runtime/src/application/refine/tools/services/refine-browser-service.ts#L66)

### Important consequence

The adapter does not currently do any of the following before returning:

- wait for page stabilization
- retry when snapshot is obviously partial
- merge multiple snapshots
- combine snapshot with screenshot OCR
- fetch extra DOM/JS state for missing regions
- segment page into header / sidebar / main / modal / floating overlays
- attach parsed section trees beyond page/tab metadata

So if `browser_snapshot` returns a partial or early semantic tree, the refine layer will preserve that partial view almost as-is.

## What The Parser Adds

The parser adds only two kinds of structure.

### 1. Page identity

It extracts:

- `Page URL` or legacy `URL`
- `Page Title` or legacy `TITLE`

Then turns them into:

- `url`
- `origin`
- `normalizedPath`
- `title`

See [refine-browser-snapshot-parser.ts#L25](/Users/cory/codes/Sasiki-dev-refine-observe-surface/apps/agent-runtime/src/application/refine/refine-browser-snapshot-parser.ts#L25) and [refine-browser-snapshot-parser.ts#L68](/Users/cory/codes/Sasiki-dev-refine-observe-surface/apps/agent-runtime/src/application/refine/refine-browser-snapshot-parser.ts#L68).

### 2. Tab metadata

It parses the `### Open tabs` section line-by-line into:

- `index`
- `url`
- `title`
- `isActive`

See [refine-browser-snapshot-parser.ts#L87](/Users/cory/codes/Sasiki-dev-refine-observe-surface/apps/agent-runtime/src/application/refine/refine-browser-snapshot-parser.ts#L87).

### Important repair behavior

If the markdown `Page URL` disagrees with the active tab URL, the parser prefers the active tab identity.

This is not theoretical; it is a deliberate repair path:

- [refine-browser-snapshot-parser.ts#L31](/Users/cory/codes/Sasiki-dev-refine-observe-surface/apps/agent-runtime/src/application/refine/refine-browser-snapshot-parser.ts#L31)
- [refine-react-tool-client.test.ts#L515](/Users/cory/codes/Sasiki-dev-refine-observe-surface/apps/agent-runtime/test/replay-refinement/refine-react-tool-client.test.ts#L515)

This is why some runs still recover correct `page` identity even when the raw `Page URL` line is stale.

## What `observe.query` Can Actually Search

`observe.query` does not search the entire snapshot text.

It only searches parsed element lines from `parseSnapshotElements(...)`, which means:

- YAML-like lines with `[ref=...]`
- old legacy `[role|ref] text` lines

It does not directly search:

- `Open tabs`
- `Page URL`
- `Page Title`
- `Events`
- console output
- plain `text:` child lines without their own `ref`

Relevant code:

- [refine-browser-service.ts#L294](/Users/cory/codes/Sasiki-dev-refine-observe-surface/apps/agent-runtime/src/application/refine/tools/services/refine-browser-service.ts#L294)
- [refine-browser-service.ts#L311](/Users/cory/codes/Sasiki-dev-refine-observe-surface/apps/agent-runtime/src/application/refine/tools/services/refine-browser-service.ts#L311)
- [refine-browser-snapshot-parser.ts#L51](/Users/cory/codes/Sasiki-dev-refine-observe-surface/apps/agent-runtime/src/application/refine/refine-browser-snapshot-parser.ts#L51)
- [refine-browser-snapshot-parser.ts#L163](/Users/cory/codes/Sasiki-dev-refine-observe-surface/apps/agent-runtime/src/application/refine/refine-browser-snapshot-parser.ts#L163)

### Practical implications

| Snapshot text pattern | Visible to agent in raw `snapshot` | Searchable by `observe.query` | Notes |
| --- | --- | --- | --- |
| `- generic [ref=e126]: 客户消息` | Yes | Yes | Good case |
| `- tab "未分配" [ref=e193]` | Yes | Yes | Good case |
| `- text: 已完成` | Yes | No | No `ref`, so query cannot target it |
| `### Open tabs` lines | Yes | No | Agent can reason over raw text, but query cannot filter them |
| `### Events` / console lines | Yes | No | Can distract reasoning but cannot be queried structurally |

## What The Agent Sees In Practice

## Sample A: Homepage snapshot that includes the customer-service entry

In the successful TikTok baseline run, homepage observation `obs_20260324_090514_720_2` clearly included the top-banner `客户消息` entry:

- `generic [ref=e126] [cursor=pointer]`
- child text `客户消息`

Evidence:

- [event_stream.jsonl#L7](/Users/cory/codes/Sasiki-dev-refine-observe-surface/artifacts/e2e/20260324_090514_720/event_stream.jsonl#L7)
- agent then explicitly clicked that exact ref at [event_stream.jsonl#L8](/Users/cory/codes/Sasiki-dev-refine-observe-surface/artifacts/e2e/20260324_090514_720/event_stream.jsonl#L8)

This proves that the current `observe.page` surface can expose the customer-service entry when the raw snapshot is stable enough.

## Sample B: Homepage snapshot that does not include the customer-service entry

In the later experimental run, homepage observation `obs_20260324_091231_578_2` did not include `客户消息` at all. The snapshot showed:

- left sidebar menu
- banner shell
- store identity area

but no customer-service text or clickable customer-message element.

Evidence:

- [event_stream.jsonl#L7](/Users/cory/codes/Sasiki-dev-refine-observe-surface/artifacts/e2e/20260324_091231_578/event_stream.jsonl#L7)
- after that, `observe.query("客服")`, `observe.query("消息")`, `observe.query("service")` all returned empty against the same observation at [event_stream.jsonl#L10](/Users/cory/codes/Sasiki-dev-refine-observe-surface/artifacts/e2e/20260324_091231_578/event_stream.jsonl#L10), [event_stream.jsonl#L13](/Users/cory/codes/Sasiki-dev-refine-observe-surface/artifacts/e2e/20260324_091231_578/event_stream.jsonl#L13), and [event_stream.jsonl#L16](/Users/cory/codes/Sasiki-dev-refine-observe-surface/artifacts/e2e/20260324_091231_578/event_stream.jsonl#L16)

This suggests the failure mode was not just “agent ignored available info”. In that run, the raw snapshot itself was materially poorer.

## Sample C: Inbox snapshot where `Page URL` is stale but active tab is correct

In the successful run, inbox observation `obs_20260324_090514_720_4` had:

- `Open tabs` showing current tab at `/chat/inbox/current`
- `Page URL` line still showing homepage
- snapshot body clearly containing inbox content like:
  - `客服会话管理`
  - `暂无未分配的聊天`
  - `搜索所有聊天记录`
  - `已分配`
  - `未分配`

Evidence:

- [event_stream.jsonl#L22](/Users/cory/codes/Sasiki-dev-refine-observe-surface/artifacts/e2e/20260324_090514_720/event_stream.jsonl#L22)

Because the parser prefers the active tab identity when `Page URL` is stale, the stored `page` became `/chat/inbox/current`, which is the correct logical page.

This is a good example of the adapter already compensating for one class of raw snapshot inconsistency.

## Sample D: Inbox snapshot with poor searchable structure

In the failed experimental run, the agent navigated directly to `/inbox` and the snapshot looked structurally weak:

- top nav and sidebar were present
- main area was effectively empty in the captured YAML
- no obvious tabs like `已分配` / `未分配`
- no searchable chat list structure

Evidence:

- navigation to `/inbox` at [event_stream.jsonl#L28](/Users/cory/codes/Sasiki-dev-refine-observe-surface/artifacts/e2e/20260324_091231_578/event_stream.jsonl#L28)
- later repeated empty `observe.query(...)` calls over observation `obs_20260324_091231_578_3` at [event_stream.jsonl#L34](/Users/cory/codes/Sasiki-dev-refine-observe-surface/artifacts/e2e/20260324_091231_578/event_stream.jsonl#L34), [event_stream.jsonl#L37](/Users/cory/codes/Sasiki-dev-refine-observe-surface/artifacts/e2e/20260324_091231_578/event_stream.jsonl#L37), [event_stream.jsonl#L40](/Users/cory/codes/Sasiki-dev-refine-observe-surface/artifacts/e2e/20260324_091231_578/event_stream.jsonl#L40), [event_stream.jsonl#L43](/Users/cory/codes/Sasiki-dev-refine-observe-surface/artifacts/e2e/20260324_091231_578/event_stream.jsonl#L43)

This run shows a second kind of limitation:

- the page may be logically correct
- but the semantically useful regions may not yet be represented in the snapshot tree

## Stage-By-Stage Comparison Table

| Stage | Raw browser truth | Raw `browser_snapshot` text | Adapter-structured data | `observe.query` power | Agent risk today |
| --- | --- | --- | --- | --- | --- |
| Immediately after `act.navigate` | Page may still be hydrating | Often minimal shell only | `page` and `tabs` can still be correct, but content sparse | Weak | Agent reasons from partial UI |
| Stable homepage | Header, sidebar, banner, shortcuts may all exist | Sometimes rich enough to include `客户消息`, sometimes not | Good `page` + `tabs`; no section labels | Only on `ref` lines | Agent may over-focus on whatever region happened to appear |
| New-tab opened but not re-observed | Correct business page may already exist in another tab | Old observation still points to prior page | Stale `observationRef` | Misleading | Context drift |
| Fresh inbox observation, stable | Tabs, filters, list, empty state visible | Strong if snapshot captures main panel | Parser can repair stale `Page URL` via active tab | Good when refs exist | Mostly workable |
| Fresh inbox observation, unstable/partial | Business page loaded but tree not complete | Header/sidebar only, main list missing | `page` may be correct, `snapshot` still weak | Very poor | Agent loops on text search |

## Where Information Is Currently Lost

### A. Before the adapter

If Playwright MCP does not emit a region into the snapshot markdown at that moment, refine cannot reconstruct it.

Examples:

- top-banner `客户消息` missing in one homepage observation
- inbox main panel effectively missing in one `/inbox` observation

### B. Inside the adapter

The adapter intentionally preserves only light structure.

It does not currently add:

- page-stability heuristics
- multiple passes over header / sidebar / main content
- a normalized element tree
- region-level summaries
- detection of “main panel missing but shell present”
- explicit “snapshot completeness” signal

### C. Inside `observe.query`

The query layer further narrows the usable surface because it only indexes `ref`-carrying element lines.

This means some visible text in the raw snapshot is not structurally searchable.

### D. Inside model reasoning

Even when the raw snapshot contains the right signal, the model may focus on the wrong region first. But that is only one failure class; it should not be confused with the two lower-level issues above.

## MVP Tradeoff Summary

The current implementation reflects the original MVP simplification:

- single raw snapshot pull
- light metadata extraction
- deterministic line-based querying
- no extra browser intelligence in the adapter

This bought:

- simple contracts
- easy provenance
- low hidden logic

But it also means the observation layer is fragile to:

- hydration timing
- partial accessibility trees
- layout shells that appear before useful content
- missing `ref` lines for meaningful text

## Candidate Enhancement Buckets For Later Discussion

This section is intentionally non-prescriptive. It is a menu of improvement areas, not a proposed plan.

| Bucket | Example capability |
| --- | --- |
| Stability | wait-for-settle before snapshot, or retry when shell-only snapshot detected |
| Multi-pass observation | header pass, main-content pass, modal/floating layer pass |
| Rich parsing | preserve section tree, region labels, role counts, list/tab/filter summaries |
| Query surface expansion | allow structured search over tabs/page metadata, or index non-`ref` text with provenance |
| Completeness checks | detect “page shell present, main content absent” and mark observation as partial |
| Mixed evidence | attach screenshot or DOM-derived metadata alongside snapshot |
| Task-aware observation modules | homepage entry discovery vs inbox triage vs editor page |

## Current Takeaway

The current problem should not be framed only as “the agent is confused”.

The more precise statement is:

- sometimes the agent truly receives a rich enough observation and performs well
- sometimes the raw snapshot is partial before the agent even starts reasoning
- sometimes the adapter repairs page identity successfully, but still lacks stronger completeness semantics
- `observe.query` is intentionally narrower than the full raw snapshot, which further reduces what is easy to access

That is the baseline needed before deciding whether the next optimization should happen in:

- MCP/browser observation
- adapter parsing
- refine tool semantics
- prompt and strategy
