import assert from "node:assert/strict";
import test from "node:test";

import type { ToolCallResult, ToolClient, ToolDefinition } from "../../../src/contracts/tool-client.js";
import { createRefineReactSession } from "../../../src/application/refine/refine-react-session.js";
import {
  RefineBrowserServiceImpl,
} from "../../../src/application/refine/tools/services/refine-browser-service.js";

type SnapshotResponse =
  | {
      kind: "error";
      text: string;
      delayMs?: number;
    }
  | {
      kind: "timeout";
      message: string;
      delayMs?: number;
    }
  | {
      kind: "snapshot";
      text: string;
      delayMs?: number;
    };

type WaitResponse =
  | {
      kind: "ok";
      delayMs?: number;
    }
  | {
      kind: "timeout";
      message: string;
      delayMs?: number;
    };

class StubRawToolClient implements ToolClient {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  private readonly snapshotResponses: SnapshotResponse[];
  private readonly waitResponses: WaitResponse[];
  private readonly includeWaitTool: boolean;
  private readonly tabListText?: string;
  private snapshotCallCount = 0;
  private waitCallCount = 0;

  constructor(options?: {
    snapshotResponses?: SnapshotResponse[];
    waitResponses?: WaitResponse[];
    includeWaitTool?: boolean;
    tabListText?: string;
  }) {
    this.snapshotResponses = options?.snapshotResponses ?? [{ kind: "snapshot", text: buildStableSnapshot() }];
    this.waitResponses = options?.waitResponses ?? [{ kind: "ok" }];
    this.includeWaitTool = options?.includeWaitTool ?? true;
    this.tabListText = options?.tabListText;
  }

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async listTools(): Promise<ToolDefinition[]> {
    const tools: ToolDefinition[] = [{ name: "browser_snapshot" }];
    if (this.includeWaitTool) {
      tools.push({ name: "browser_wait_for" });
    }
    if (this.tabListText) {
      tools.push({ name: "browser_tabs" });
    }
    return tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    this.calls.push({ name, args });
    if (name === "browser_wait_for") {
      return this.callWaitTool();
    }
    if (name === "browser_tabs") {
      return this.callTabsTool(args);
    }
    if (name !== "browser_snapshot") {
      throw new Error(`unexpected raw tool: ${name}`);
    }
    return this.callSnapshotTool();
  }

  private async callWaitTool(): Promise<ToolCallResult> {
    const response = this.waitResponses[this.waitCallCount];
    this.waitCallCount += 1;
    if (!response) {
      throw new Error("unexpected browser_wait_for call");
    }
    await this.delay(response.delayMs);
    if (response.kind === "timeout") {
      throw new Error(response.message);
    }
    return {
      content: [
        {
          type: "text",
          text: "wait complete",
        },
      ],
    };
  }

  private async callSnapshotTool(): Promise<ToolCallResult> {
    const response = this.snapshotResponses[this.snapshotCallCount];
    this.snapshotCallCount += 1;
    if (!response) {
      throw new Error("unexpected browser_snapshot call");
    }
    await this.delay(response.delayMs);
    if (response.kind === "error") {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: response.text,
          },
        ],
      };
    }
    if (response.kind === "timeout") {
      throw new Error(response.message);
    }
    return {
      content: [
        {
          type: "text",
          text: response.text,
        },
      ],
    };
  }

  private async callTabsTool(args: Record<string, unknown>): Promise<ToolCallResult> {
    const action = typeof args.action === "string" ? args.action : "";
    if (action === "list") {
      return {
        content: [
          {
            type: "text",
            text: this.tabListText ?? "",
          },
        ],
      };
    }
    if (action === "select") {
      return {
        content: [
          {
            type: "text",
            text: "### Result\n- 0: [Visible Blank](about:blank)\n- 1: (current) [Seller](https://seller.tiktokshopglobalselling.com/homepage?shop_region=VN)\n- 2: [Omnibox Popup](chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html)",
          },
        ],
      };
    }
    throw new Error(`unexpected browser_tabs action: ${action}`);
  }

  private async delay(delayMs?: number): Promise<void> {
    if (!delayMs || delayMs <= 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
}

function buildStableSnapshot(): string {
  return buildSnapshotText({
    pageUrl: "https://example.com/one",
    pageTitle: "Stable Page",
    bodyLines: [
      "- button \"Go\" [ref=el-go] [cursor=pointer]",
    ],
  });
}

function buildTabsListText(lines: string[]): string {
  return ["### Open tabs", ...lines].join("\n");
}

function buildSnapshotText(input: {
  pageUrl: string;
  pageTitle: string;
  bodyLines: string[];
}): string {
  return [
    "### Open tabs",
    `- 0: (current) [${input.pageTitle}](${input.pageUrl})`,
    "- 1: [New Tab](about:blank)",
    "### Page",
    `- Page URL: ${input.pageUrl}`,
    `- Page Title: ${input.pageTitle}`,
    "### Snapshot",
    "```yaml",
    ...input.bodyLines,
    "```",
  ].join("\n");
}

function countSnapshotCalls(rawClient: StubRawToolClient): number {
  return rawClient.calls.filter((call) => call.name === "browser_snapshot").length;
}

function countWaitCalls(rawClient: StubRawToolClient): number {
  return rawClient.calls.filter((call) => call.name === "browser_wait_for").length;
}

test("browser service rebinds the latest session before stabilized page observation", async () => {
  const rawClient = new StubRawToolClient({
    snapshotResponses: [
      { kind: "snapshot", text: buildStableSnapshot() },
      { kind: "snapshot", text: buildStableSnapshot() },
      { kind: "snapshot", text: buildStableSnapshot() },
      { kind: "snapshot", text: buildStableSnapshot() },
    ],
    waitResponses: [{ kind: "ok" }, { kind: "ok" }],
  });
  const service = new RefineBrowserServiceImpl({
    rawClient,
    session: createRefineReactSession("run-1", "task-1", { taskScope: "scope-1" }),
  });

  const first = await service.capturePageObservation();
  service.setSession(createRefineReactSession("run-2", "task-2", { taskScope: "scope-2" }));
  const second = await service.capturePageObservation();

  assert.equal(first.observation.observationRef, "obs_run-1_1");
  assert.equal(second.observation.observationRef, "obs_run-2_1");
  assert.equal(first.observation.observationReadiness, "ready");
  assert.equal(second.observation.observationReadiness, "ready");
  assert.equal(first.observation.pageTab?.title, "Stable Page");
  assert.equal(second.observation.pageTab?.title, "Stable Page");
  assert.deepEqual(first.observation.taskRelevantTabs?.map((tab) => tab.title), ["Stable Page"]);
  assert.deepEqual(second.observation.taskRelevantTabs?.map((tab) => tab.title), ["Stable Page"]);
  assert.equal(service.getSession().runId, "run-2");
  assert.equal(countSnapshotCalls(rawClient), 4);
  assert.equal(countWaitCalls(rawClient), 2);
  assert.deepEqual(rawClient.calls.map((call) => call.name), [
    "browser_wait_for",
    "browser_snapshot",
    "browser_snapshot",
    "browser_wait_for",
    "browser_snapshot",
    "browser_snapshot",
  ]);
});

test("browser service treats a pre-gate timeout as non-fatal before stabilizing the page", async () => {
  const rawClient = new StubRawToolClient({
    waitResponses: [
      {
        kind: "timeout",
        message: "browser_wait_for timed out before pre-gate capture",
      },
    ],
    snapshotResponses: [
      {
        kind: "snapshot",
        text: buildStableSnapshot(),
      },
      {
        kind: "snapshot",
        text: buildStableSnapshot(),
      },
    ],
  });
  const service = new RefineBrowserServiceImpl({
    rawClient,
    session: createRefineReactSession("run-timeout", "task-timeout", { taskScope: "scope-timeout" }),
  });

  const result = await service.capturePageObservation();

  assert.equal(result.observation.observationReadiness, "ready");
  assert.equal(result.observation.pageTab?.title, "Stable Page");
  assert.deepEqual(result.observation.taskRelevantTabs?.map((tab) => tab.title), ["Stable Page"]);
  assert.equal(countWaitCalls(rawClient), 1);
  assert.equal(countSnapshotCalls(rawClient), 2);
  assert.deepEqual(rawClient.calls.map((call) => call.name), [
    "browser_wait_for",
    "browser_snapshot",
    "browser_snapshot",
  ]);
});

test("browser service still stabilizes when the first snapshot takes longer than a tiny local tick", async () => {
  const rawClient = new StubRawToolClient({
    waitResponses: [{ kind: "ok" }],
    snapshotResponses: [
      {
        kind: "snapshot",
        delayMs: 120,
        text: buildStableSnapshot(),
      },
      {
        kind: "snapshot",
        delayMs: 120,
        text: buildStableSnapshot(),
      },
    ],
  });
  const service = new RefineBrowserServiceImpl({
    rawClient,
    session: createRefineReactSession("run-slow-first-snapshot", "task-slow-first-snapshot", {
      taskScope: "scope-slow-first-snapshot",
    }),
  });

  const result = await service.capturePageObservation();

  assert.equal(result.observation.observationReadiness, "ready");
  assert.equal(result.observation.page.url, "https://example.com/one");
  assert.equal(result.observation.pageTab?.title, "Stable Page");
  assert.deepEqual(result.observation.taskRelevantTabs?.map((tab) => tab.title), ["Stable Page"]);
  assert.equal(countWaitCalls(rawClient), 1);
  assert.equal(countSnapshotCalls(rawClient), 2);
});

test("browser service aligns away from popup or blank tabs before the first snapshot", async () => {
  const rawClient = new StubRawToolClient({
    tabListText: buildTabsListText([
      "- 0: (current) [Omnibox Popup](chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html)",
      "- 1: [Seller](https://seller.tiktokshopglobalselling.com/homepage?shop_region=VN)",
      "- 2: [Visible Blank](about:blank)",
    ]),
    waitResponses: [{ kind: "ok" }],
    snapshotResponses: [
      {
        kind: "snapshot",
        text: buildSnapshotText({
          pageUrl: "https://seller.tiktokshopglobalselling.com/homepage?shop_region=VN",
          pageTitle: "Untitled",
          bodyLines: ['- button "Customer Message" [ref=el-message] [cursor=pointer]'],
        }),
      },
      {
        kind: "snapshot",
        text: buildSnapshotText({
          pageUrl: "https://seller.tiktokshopglobalselling.com/homepage?shop_region=VN",
          pageTitle: "Untitled",
          bodyLines: ['- button "Customer Message" [ref=el-message] [cursor=pointer]'],
        }),
      },
    ],
  });
  const service = new RefineBrowserServiceImpl({
    rawClient,
    session: createRefineReactSession("run-bootstrap-align", "task-bootstrap-align", { taskScope: "scope-bootstrap-align" }),
  });

  const result = await service.capturePageObservation();

  assert.equal(result.observation.page.url, "https://seller.tiktokshopglobalselling.com/homepage?shop_region=VN");
  assert.equal(result.observation.activeTabIndex, 0);
  assert.deepEqual(rawClient.calls.map((call) => [call.name, call.args.action ?? ""]), [
    ["browser_tabs", "list"],
    ["browser_tabs", "select"],
    ["browser_wait_for", ""],
    ["browser_snapshot", ""],
    ["browser_snapshot", ""],
  ]);
  const selectCall = rawClient.calls.find((call) => call.name === "browser_tabs" && call.args.action === "select");
  assert.equal(selectCall?.args.index, 1);
});

test("browser service falls back to a non-popup blank tab before bootstrap navigation", async () => {
  const rawClient = new StubRawToolClient({
    tabListText: buildTabsListText([
      "- 0: (current) [Omnibox Popup](chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html)",
      "- 1: [Visible Blank](about:blank)",
      "- 2: [Omnibox Popup](chrome://omnibox-popup.top-chrome/)",
    ]),
    waitResponses: [{ kind: "ok" }],
    snapshotResponses: [
      {
        kind: "snapshot",
        text: buildSnapshotText({
          pageUrl: "about:blank",
          pageTitle: "Visible Blank",
          bodyLines: [],
        }),
      },
      {
        kind: "snapshot",
        text: buildSnapshotText({
          pageUrl: "about:blank",
          pageTitle: "Visible Blank",
          bodyLines: [],
        }),
      },
    ],
  });
  const service = new RefineBrowserServiceImpl({
    rawClient,
    session: createRefineReactSession("run-bootstrap-blank", "task-bootstrap-blank", { taskScope: "scope-bootstrap-blank" }),
  });

  const result = await service.capturePageObservation();

  assert.equal(result.observation.page.url, "about:blank");
  const selectCall = rawClient.calls.find((call) => call.name === "browser_tabs" && call.args.action === "select");
  assert.equal(selectCall?.args.index, 1);
});

test("browser service fails observe.query fast when there is no existing observation", async () => {
  const rawClient = new StubRawToolClient();
  const service = new RefineBrowserServiceImpl({
    rawClient,
    session: createRefineReactSession("run-query-empty", "task-query-empty", { taskScope: "scope-query-empty" }),
  });

  await assert.rejects(
    () =>
      service.queryObservation({
        mode: "search",
        text: "anything",
      }),
    /observe\.page/i,
  );
  assert.equal(rawClient.calls.length, 0);
});

test("browser service rejects structured snapshot errors instead of parsing them as observations", async () => {
  const rawClient = new StubRawToolClient({
    snapshotResponses: [
      {
        kind: "error",
        text: "structured snapshot error: browser_snapshot returned isError=true",
      },
    ],
  });
  const service = new RefineBrowserServiceImpl({
    rawClient,
    session: createRefineReactSession("run-structured-error", "task-structured-error", { taskScope: "scope-structured-error" }),
  });

  await assert.rejects(() => service.capturePageObservation(), /browser_snapshot returned an error|isError=true/i);
  assert.equal(countSnapshotCalls(rawClient), 1);
});

test("browser service rejects text-only snapshot errors instead of parsing them as observations", async () => {
  const rawClient = new StubRawToolClient({
    snapshotResponses: [
      {
        kind: "snapshot",
        text: "### Error\nbrowser_snapshot failed before a valid observation was produced",
      },
    ],
  });
  const service = new RefineBrowserServiceImpl({
    rawClient,
    session: createRefineReactSession("run-text-error", "task-text-error", { taskScope: "scope-text-error" }),
  });

  await assert.rejects(() => service.capturePageObservation(), /browser_snapshot returned an error|### Error/i);
  assert.equal(countSnapshotCalls(rawClient), 1);
});

test("browser service returns an incomplete stabilized observation from the best sample before the deadline", async () => {
  const rawClient = new StubRawToolClient({
    waitResponses: [{ kind: "ok" }],
    snapshotResponses: [
      {
        kind: "snapshot",
        text: buildSnapshotText({
          pageUrl: "https://example.com/one",
          pageTitle: "Stability Demo",
          bodyLines: [
            "- button \"One\" [ref=el-one] [cursor=pointer]",
          ],
        }),
      },
      {
        kind: "snapshot",
        text: buildSnapshotText({
          pageUrl: "https://example.com/one",
          pageTitle: "Stability Demo",
          bodyLines: [
            "- button \"One\" [ref=el-one] [cursor=pointer]",
            "- link \"Two\" [ref=el-two] [cursor=pointer]",
          ],
        }),
      },
      {
        kind: "snapshot",
        delayMs: 120,
        text: buildSnapshotText({
          pageUrl: "https://example.com/one",
          pageTitle: "Stability Demo",
          bodyLines: [
            "- button \"One\" [ref=el-one] [cursor=pointer]",
            "- link \"Two\" [ref=el-two] [cursor=pointer]",
            "- paragraph [ref=el-three]: Better but too late",
          ],
        }),
      },
    ],
  });
  const service = new RefineBrowserServiceImpl({
    rawClient,
    session: createRefineReactSession("run-hard-timeout", "task-hard-timeout", { taskScope: "scope-hard-timeout" }),
    stabilizationSettings: {
      overallDeadlineMs: 80,
    },
  });

  const result = await service.capturePageObservation();

  assert.equal(result.observation.observationReadiness, "incomplete");
  assert.equal(result.observation.pageTab?.title, "Stability Demo");
  assert.deepEqual(result.observation.taskRelevantTabs?.map((tab) => tab.title), ["Stability Demo"]);
  assert.match(result.observation.snapshot, /link "Two"/);
  assert.doesNotMatch(result.observation.snapshot, /Better but too late/);
  assert.equal(countWaitCalls(rawClient), 1);
  assert.equal(countSnapshotCalls(rawClient), 3);
  assert.deepEqual(rawClient.calls.map((call) => call.name), [
    "browser_wait_for",
    "browser_snapshot",
    "browser_snapshot",
    "browser_snapshot",
  ]);
});

test("browser service prefers the latest frontier when timeout fallback must pick a stale-vs-current page", async () => {
  const rawClient = new StubRawToolClient({
    waitResponses: [{ kind: "ok" }],
    snapshotResponses: [
      {
        kind: "snapshot",
        text: buildSnapshotText({
          pageUrl: "https://example.com/alpha",
          pageTitle: "Frontier Alpha",
          bodyLines: [
            "- button \"Alpha\" [ref=el-alpha] [cursor=pointer]",
          ],
        }),
      },
      {
        kind: "snapshot",
        text: buildSnapshotText({
          pageUrl: "https://example.com/alpha",
          pageTitle: "Frontier Alpha",
          bodyLines: [
            "- button \"Alpha\" [ref=el-alpha] [cursor=pointer]",
            "- link \"Alpha Dense\" [ref=el-alpha-dense] [cursor=pointer]",
          ],
        }),
      },
      {
        kind: "snapshot",
        text: buildSnapshotText({
          pageUrl: "https://example.com/beta",
          pageTitle: "Frontier Beta",
          bodyLines: [
            "- button \"Beta\" [ref=el-beta] [cursor=pointer]",
          ],
        }),
      },
    ],
  });
  const service = new RefineBrowserServiceImpl({
    rawClient,
    session: createRefineReactSession("run-frontier", "task-frontier", { taskScope: "scope-frontier" }),
  });

  const result = await service.capturePageObservation();

  assert.equal(result.observation.observationReadiness, "incomplete");
  assert.equal(result.observation.pageTab?.title, "Frontier Beta");
  assert.deepEqual(result.observation.taskRelevantTabs?.map((tab) => tab.title), ["Frontier Beta"]);
  assert.match(result.observation.snapshot, /Frontier Beta/);
  assert.doesNotMatch(result.observation.snapshot, /Frontier Alpha/);
  assert.equal(countSnapshotCalls(rawClient), 3);
  assert.deepEqual(rawClient.calls.map((call) => call.name), [
    "browser_wait_for",
    "browser_snapshot",
    "browser_snapshot",
    "browser_snapshot",
  ]);
});

test("browser service does not converge when same page identity and metrics carry different snapshot content", async () => {
  const rawClient = new StubRawToolClient({
    waitResponses: [{ kind: "ok" }],
    snapshotResponses: [
      {
        kind: "snapshot",
        text: buildSnapshotText({
          pageUrl: "https://example.com/content",
          pageTitle: "Content Fingerprint",
          bodyLines: [
            "- button \"Alpha\" [ref=el-shared] [cursor=pointer]",
          ],
        }),
      },
      {
        kind: "snapshot",
        text: buildSnapshotText({
          pageUrl: "https://example.com/content",
          pageTitle: "Content Fingerprint",
          bodyLines: [
            "- button \"Beta\" [ref=el-shared] [cursor=pointer]",
          ],
        }),
      },
      {
        kind: "snapshot",
        text: buildSnapshotText({
          pageUrl: "https://example.com/content",
          pageTitle: "Content Fingerprint",
          bodyLines: [
            "- button \"Gamma\" [ref=el-shared] [cursor=pointer]",
          ],
        }),
      },
    ],
  });
  const service = new RefineBrowserServiceImpl({
    rawClient,
    session: createRefineReactSession("run-content", "task-content", { taskScope: "scope-content" }),
  });

  const result = await service.capturePageObservation();

  assert.equal(result.observation.observationReadiness, "incomplete");
  assert.equal(countSnapshotCalls(rawClient), 3);
  assert.match(result.observation.snapshot, /Gamma/);
  assert.doesNotMatch(result.observation.snapshot, /Alpha/);
  assert.doesNotMatch(result.observation.snapshot, /Beta/);
});

test("browser service never settles with more than three fast snapshots", async () => {
  const rawClient = new StubRawToolClient({
    waitResponses: [{ kind: "ok" }],
    snapshotResponses: [
      {
        kind: "snapshot",
        text: buildSnapshotText({
          pageUrl: "https://example.com/one",
          pageTitle: "Three Cap Demo",
          bodyLines: [
            "- button \"One\" [ref=el-one] [cursor=pointer]",
          ],
        }),
      },
      {
        kind: "snapshot",
        text: buildSnapshotText({
          pageUrl: "https://example.com/one",
          pageTitle: "Three Cap Demo",
          bodyLines: [
            "- button \"One\" [ref=el-one] [cursor=pointer]",
            "- link \"Two\" [ref=el-two] [cursor=pointer]",
          ],
        }),
      },
      {
        kind: "snapshot",
        text: buildSnapshotText({
          pageUrl: "https://example.com/one",
          pageTitle: "Three Cap Demo",
          bodyLines: [
            "- button \"One\" [ref=el-one] [cursor=pointer]",
            "- link \"Two\" [ref=el-two] [cursor=pointer]",
            "- paragraph [ref=el-three]: Third sample should win",
          ],
        }),
      },
      {
        kind: "snapshot",
        text: buildSnapshotText({
          pageUrl: "https://example.com/one",
          pageTitle: "Three Cap Demo",
          bodyLines: [
            "- button \"One\" [ref=el-one] [cursor=pointer]",
            "- link \"Two\" [ref=el-two] [cursor=pointer]",
            "- paragraph [ref=el-three]: Third sample should win",
            "- paragraph [ref=el-four]: Fourth sample must never be captured",
          ],
        }),
      },
    ],
  });
  const service = new RefineBrowserServiceImpl({
    rawClient,
    session: createRefineReactSession("run-three-cap", "task-three-cap", { taskScope: "scope-three-cap" }),
  });

  const result = await service.capturePageObservation();

  assert.equal(result.observation.observationReadiness, "incomplete");
  assert.equal(countWaitCalls(rawClient), 1);
  assert.equal(countSnapshotCalls(rawClient), 3);
  assert.match(result.observation.snapshot, /Third sample should win/);
  assert.doesNotMatch(result.observation.snapshot, /Fourth sample must never be captured/);
  assert.deepEqual(rawClient.calls.map((call) => call.name), [
    "browser_wait_for",
    "browser_snapshot",
    "browser_snapshot",
    "browser_snapshot",
  ]);
});
