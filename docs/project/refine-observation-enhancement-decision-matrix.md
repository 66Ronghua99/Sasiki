# Refine Observation Enhancement Decision Matrix

## Purpose

This note is the follow-up to [refine-observe-page-surface-analysis.md](/Users/cory/codes/Sasiki-dev-refine-observe-surface/docs/project/refine-observe-page-surface-analysis.md).

The first note explains the current reality. This note answers the next question:

- which gaps belong to raw browser capture
- which gaps belong to the adapter
- which gaps belong to the query surface
- which gaps should be left to prompt/model behavior

The goal is to avoid overfitting prompt text to a problem that is actually caused by weak observation shape.

## Decision Rule

Use the following rule when deciding where to add capability:

1. If the signal is absent from the raw snapshot, prompt changes will not fix it.
2. If the signal is visible in raw snapshot but hard to use repeatedly, prefer adapter/query improvements over prompt complexity.
3. If the signal is already structured and reliable, prompt/tool semantics are the right place to guide usage.

## Layer Decision Table

| Problem class | Example in TikTok runs | Best owner | Why |
| --- | --- | --- | --- |
| Raw page region missing from snapshot | homepage run where `客户消息` never appeared in snapshot | browser capture policy or adapter stability wrapper | Model cannot use what never entered the observation |
| Page identity stale but active tab correct | inbox run where `Page URL` stayed on homepage | adapter parser | This is deterministic repair, not model reasoning |
| Text visible in snapshot but not queryable | `text:` lines, open tabs, empty-state copy | query/index layer | The signal exists, but current search surface hides it |
| Snapshot has useful structure but model explores wrong region first | homepage snapshot contains `客户消息`, but model searches sidebar/menu | prompt/tool semantics | This is attention guidance, not missing data |
| Shell visible but main panel absent | `/inbox` snapshot with header/sidebar but no chat list | adapter completeness/stability layer | We need a machine-readable “partial observation” signal before asking the model to reason |

## Recommended Priority By Layer

| Layer | Priority | Recommendation |
| --- | --- | --- |
| Browser capture stability | High | Add settle/retry policy before accepting a snapshot as the canonical page observation |
| Adapter structure | Highest | Add stronger parsed structure and explicit observation health/completeness signals |
| Query surface | High | Expand deterministic searchable surface beyond `ref` lines only |
| Prompt/tool semantics | Medium | Keep improving, but only after the observation contract is stronger |
| Screenshot/OCR fusion | Medium-Low | Useful later, but not the first ratchet if DOM/accessibility capture can still be improved cheaply |

## What The Agent Should See

The next observation contract should preserve both raw facts and derived structure.

Do not replace raw snapshot text. Add layers on top of it.

### 1. Keep raw truth for provenance

The agent should still receive:

- raw `snapshot`
- parsed `page`
- parsed `tabs`
- `activeTabIndex`
- `capturedAt`

This keeps debugging easy and prevents hidden logic from becoming opaque.

### 2. Add observation health

The agent should also receive machine-readable health signals such as:

- `stabilityStatus`: `settling | stable | partial`
- `completenessStatus`: `unknown | shell_only | content_present`
- `mainContentPresent`: boolean
- `emptyStateDetected`: boolean
- `observationWarnings[]`

This is the missing bridge between “browser returned something” and “this is a good page state to reason over”.

### 3. Add page-region structure

Instead of only exposing one large snapshot string, the adapter should derive regions such as:

- `header`
- `sidebar`
- `main`
- `modal`
- `floating`

Each region does not need a perfect tree on day one. A useful first version could be:

- region label
- whether the region exists
- short summary text
- important refs inside the region
- role counts

### 4. Add task-facing summaries

For queue/inbox style tasks, the agent benefits from compact summaries more than raw tree depth.

Examples:

- `tabsSummary`
  - active tab label
  - visible tab labels
  - badge counts if detectable
- `listSummary`
  - list exists or not
  - visible row count
  - whether rows look like conversations
- `emptyStateSummary`
  - empty-state text
  - whether it is clearly a verified empty queue

### 5. Add searchable text buckets

The deterministic query layer should not stay limited to only `ref`-carrying element lines.

A better split is:

- `actionable elements`
  - current behavior, only `ref` lines
- `descriptive text`
  - empty-state copy
  - labels
  - headings
  - section text without refs
- `page metadata`
  - page title
  - page url
  - open tabs

The key point is not “let the model do fuzzy search on everything”. The key point is to let deterministic search reach more of the observation surface with clear provenance.

## What Tabs Should The Agent See

The current `tabs` field exposes all tabs parsed from `### Open tabs`, including noisy ones like `about:blank` and `Omnibox Popup`.

That is useful for provenance, but weak for task execution.

The recommendation is:

1. Keep `tabs` as the raw parsed truth.
2. Add a derived field for execution-oriented reasoning.

Suggested additional fields:

- `taskRelevantTabs`
  - tabs that look like business pages
  - excludes obvious browser-only UI such as omnibox popup
- `pageTab`
  - the adapter's best match for the page represented by this observation
- `newlyOpenedTabs`
  - tabs not present in the previous observation, if previous observation exists

This lets us keep debuggability without forcing the model to reason over browser noise every time.

## What Each TikTok Stage Should Expose

### Homepage stage

The agent should ideally see:

- banner/shortcut region summary
- whether `客户消息` exists in any visible region
- top-level CTA refs in header/banner
- task-relevant tabs, especially any newly opened shop/customer-service tab

If homepage only exposes sidebar and shell, the observation should explicitly say it is partial instead of pretending the page is ready.

### Inbox stage

The agent should ideally see:

- queue tab labels like `已分配` / `未分配`
- search box presence
- conversation list presence
- row count or clear empty-state signal
- empty-state summary

For this task class, this layer is more important than richer prompt wording.

### Conversation-detail stage

The agent should ideally see:

- selected conversation identity
- whether the thread body is present
- whether there is a latest human reply
- whether the composer is visible
- whether the page is read-only or reply-capable

Without these, asking the model to “summarize the latest manually replied conversation” is too inference-heavy.

## What Not To Do First

The following are lower priority than adapter structure and stability:

- adding much more prompt text
- adding more keyword heuristics to `observe.query`
- making the model try the same query many times
- hiding raw tabs completely
- replacing raw snapshot with only summaries

These either mask the real issue or reduce debuggability.

## Recommended Near-Term Direction

If we optimize one layer first, the adapter is the best leverage point.

Why:

- it already owns page/tab parsing
- it is the natural place to add settle/retry/completeness semantics
- it can preserve raw truth while adding structure
- it reduces both prompt burden and query brittleness

The practical order should be:

1. add observation health and partial/shell-only detection
2. add region and queue/inbox summaries
3. widen deterministic query surface
4. then revisit prompt/tool semantics

## Takeaway

The next improvement should not be framed as “make the model less confused”.

It should be framed as:

- give the model a more truthful observation health signal
- give the model a more task-shaped page summary
- keep raw provenance for debugging
- only then tighten prompt strategy on top
