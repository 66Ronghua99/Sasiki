# Watch-Once v0 Engineering Handoff (2026-03-04)

## 1) Objective

Deliver one executable minimum loop for Watch-Once v0:

`observe once -> generate SOP artifacts -> index/retrieve -> provide agent-consumable guide`

Baseline acceptance site for first engineering delivery: `Baidu` (single-tab only).

Hard constraints:
- Keep current `run` mode backward-compatible.
- Keep V0 single-tab only.
- Generate deterministic, versioned SOP contracts (`v0`).

Deferred to V1:
- Multi-tab workflows.
- Data masking/redaction and retention policy.
- Full deterministic replay engine.

---

## 2) File-by-File Interface Draft

## 2.1 CLI Mode Entry
Target: `apps/agent-runtime/src/index.ts`

```ts
type RuntimeMode = "run" | "observe";

interface CliArguments {
  configPath?: string;
  mode: RuntimeMode;
  task: string;
}
```

Rules:
- Add `--mode run|observe` (default: `run`).
- `run` path keeps existing behavior.
- `observe` path calls `runtime.observe(taskHint)`.

---

## 2.2 Runtime Config
Target: `apps/agent-runtime/src/runtime/runtime-config.ts`

```ts
export interface RuntimeConfigFile {
  observe?: {
    timeoutMs?: number;
  };
}

export interface RuntimeConfig {
  observeTimeoutMs: number;
}
```

Constants:
- SOP asset root path fixed for V0: `~/.sasiki/sop_assets/`.

---

## 2.3 SOP Trace Domain Contract (new)
Target: `apps/agent-runtime/src/domain/sop-trace.ts`

```ts
export const SOP_TRACE_VERSION = "v0" as const;
export type SopAction = "navigate" | "click" | "type" | "press_key" | "scroll" | "wait";

export interface DemonstrationRawEvent {
  eventId: string;
  timestamp: string;
  type: "navigate" | "click" | "input" | "keydown" | "scroll" | "wait";
  url: string;
  payload: Record<string, unknown>;
}

export interface SopTraceStep {
  stepIndex: number;
  timestamp: string;
  action: SopAction;
  target: { type: "url" | "selector" | "text" | "key"; value: string };
  input: Record<string, unknown>;
  page: { urlBefore: string; urlAfter: string };
  assertionHint?: { type: string; value: string };
  rawRef: string;
}

export interface SopTrace {
  traceVersion: "v0";
  traceId: string;
  mode: "observe";
  site: string;
  singleTabOnly: true;
  taskHint: string;
  steps: SopTraceStep[];
}

export function validateSopTrace(trace: SopTrace): void;
```

Validation rules:
- `traceVersion` must be `v0`.
- `steps` must be time-ordered.
- `stepIndex` must be contiguous from 1.
- `action` must be in V0 vocabulary.
- every step must contain `rawRef`.

---

## 2.4 SOP Asset Domain Contract (new)
Target: `apps/agent-runtime/src/domain/sop-asset.ts`

```ts
export const SOP_ASSET_VERSION = "v0" as const;

export interface WebElementHint {
  stepIndex: number;
  purpose: string;
  selector?: string;
  textHint?: string;
  roleHint?: string;
}

export interface SopAsset {
  assetVersion: "v0";
  assetId: string;
  site: string;
  taskHint: string;
  tags: string[];
  tracePath: string;
  draftPath: string;
  guidePath: string;
  webElementHints: WebElementHint[];
  createdAt: string;
}

export interface SopAssetQuery {
  site?: string;
  tag?: string;
  taskHint?: string;
  limit?: number;
}
```

---

## 2.5 Runtime Error Codes (new)
Target: `apps/agent-runtime/src/domain/runtime-errors.ts`

```ts
export type RuntimeErrorCode =
  | "OBSERVE_NO_EVENTS_CAPTURED"
  | "OBSERVE_MULTI_TAB_NOT_SUPPORTED"
  | "SOP_TRACE_SCHEMA_INVALID"
  | "SOP_ASSET_INDEX_WRITE_FAILED"
  | "SOP_ASSET_NOT_FOUND";

export class RuntimeError extends Error {
  constructor(
    public readonly code: RuntimeErrorCode,
    message: string,
    public readonly detail?: Record<string, unknown>
  ) {
    super(message);
  }
}
```

---

## 2.6 Browser Demonstration Recorder Adapter (new)
Target: `apps/agent-runtime/src/infrastructure/browser/playwright-demonstration-recorder.ts`

```ts
export interface ObserveCaptureOptions {
  cdpEndpoint: string;
  singleTabOnly: true;
  timeoutMs: number;
}

export class PlaywrightDemonstrationRecorder {
  start(options: ObserveCaptureOptions): Promise<void>;
  stop(): Promise<DemonstrationRawEvent[]>;
}
```

Implementation notes:
- Connect via `playwright-core` `chromium.connectOverCDP`.
- Bind the first page/tab only.
- Detect secondary tab creation and throw `OBSERVE_MULTI_TAB_NOT_SUPPORTED`.
- Keep raw events in memory, flush on `stop()`.

---

## 2.7 Core Normalizer / Draft Builder (new)
Target: `apps/agent-runtime/src/core/sop-demonstration-recorder.ts`

```ts
export interface BuildTraceInput {
  traceId: string;
  taskHint: string;
  site: string;
  rawEvents: DemonstrationRawEvent[];
}

export class SopDemonstrationRecorder {
  buildTrace(input: BuildTraceInput): SopTrace;
  buildDraft(trace: SopTrace): string;
  buildWebElementHints(trace: SopTrace): WebElementHint[];
}
```

Rules:
- Deterministic step order and numbering.
- Enforce V0 action vocabulary.
- map each step to `rawRef`.

---

## 2.8 Artifact Writer Extensions
Target: `apps/agent-runtime/src/runtime/artifacts-writer.ts`

```ts
writeDemonstrationRaw(events: DemonstrationRawEvent[]): Promise<void>;
writeDemonstrationTrace(trace: SopTrace): Promise<void>;
writeSopDraft(markdown: string): Promise<void>;
writeSopAsset(asset: SopAsset): Promise<void>;
demonstrationRawPath(): string;
demonstrationTracePath(): string;
sopDraftPath(): string;
sopAssetPath(): string;
```

V0 required files:
- `demonstration_raw.jsonl`
- `demonstration_trace.json`
- `sop_draft.md`
- `sop_asset.json`

---

## 2.9 SOP Asset Store (new)
Target: `apps/agent-runtime/src/runtime/sop-asset-store.ts`

```ts
export class SopAssetStore {
  constructor(rootDir?: string);
  upsert(asset: SopAsset): Promise<void>;
  search(query: SopAssetQuery): Promise<SopAsset[]>;
  getById(assetId: string): Promise<SopAsset | null>;
}
```

Storage:
- Root: `~/.sasiki/sop_assets/`
- Index file: `~/.sasiki/sop_assets/index.json`

---

## 2.10 Runtime Observe Path
Target: `apps/agent-runtime/src/runtime/agent-runtime.ts`

```ts
export interface ObserveRunResult {
  runId: string;
  mode: "observe";
  taskHint: string;
  status: "completed" | "failed";
  finishReason: string;
  artifactsDir: string;
  tracePath?: string;
  draftPath?: string;
  assetPath?: string;
}

async observe(taskHint: string): Promise<ObserveRunResult>;
```

Expected flow:
1. create run id + artifact dir
2. start demonstration recorder
3. wait for user demonstration end
4. stop recorder and receive raw events
5. build trace/draft/hints
6. write 4 files
7. upsert asset index
8. return `ObserveRunResult`

---

## 3) Development Sequence

### PR-1 Contract Foundation
- add `sop-trace.ts`
- add `sop-asset.ts`
- add `runtime-errors.ts`
- extend `artifacts-writer.ts` with new write APIs (no observe wiring yet)

### PR-2 Observe End-to-End Baseline
- add CLI mode switch in `index.ts`
- add `runtime.observe()`
- add `playwright-demonstration-recorder.ts`
- add `sop-demonstration-recorder.ts`
- produce 4 artifacts for one Baidu demonstration

### PR-3 Asset Retrieval + Stabilization
- add `sop-asset-store.ts` index/search
- wire guide + web element hints into asset contract
- run baseline acceptance evidence collection

---

## 4) Acceptance and Evidence

Pass only when all items are true:
- one `observe` run produces all 4 V0 files
- trace schema validation passes
- asset index can retrieve by `site/taskHint`
- asset contains natural language guide and web element hints
- existing `run` mode behavior remains compatible

Evidence sources:
- run artifact folder
- local SOP asset index file
- runtime log entries

---

## 5) Quality Gates

Required before claiming completion:
- `npm --prefix apps/agent-runtime run typecheck`
- `npm --prefix apps/agent-runtime run build`

