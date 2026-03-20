import assert from "node:assert/strict";
import test from "node:test";

import { SopRuleCompactBuilder } from "../../../src/application/compact/sop-rule-compact-builder.js";
import { SopRuleCompactBuilder as RuntimeSopRuleCompactBuilder } from "../../../src/runtime/sop-rule-compact-builder.js";
import type { SopTrace } from "../../../src/domain/sop-trace.js";

const trace: SopTrace = {
  traceVersion: "v0",
  traceId: "trace-1",
  mode: "observe",
  site: "example.com",
  singleTabOnly: true,
  taskHint: "search coffee beans",
  steps: [
    {
      stepIndex: 1,
      timestamp: "2026-03-21T00:00:00.000Z",
      action: "type",
      tabId: "tab-1",
      target: {
        type: "selector",
        value: "#query",
      },
      input: {
        value: "coffee",
        textHint: "search box",
        roleHint: "textbox",
      },
      page: {
        urlBefore: "https://example.com/",
        urlAfter: "https://example.com/",
      },
      rawRef: "raw-1",
    },
    {
      stepIndex: 2,
      timestamp: "2026-03-21T00:00:01.000Z",
      action: "press_key",
      tabId: "tab-1",
      target: {
        type: "key",
        value: "Enter",
      },
      input: {},
      page: {
        urlBefore: "https://example.com/",
        urlAfter: "https://example.com/",
      },
      rawRef: "raw-2",
    },
    {
      stepIndex: 3,
      timestamp: "2026-03-21T00:00:02.000Z",
      action: "click",
      tabId: "tab-1",
      target: {
        type: "selector",
        value: "#submit",
      },
      input: {},
      page: {
        urlBefore: "https://example.com/",
        urlAfter: "https://example.com/results",
      },
      rawRef: "raw-3",
    },
  ],
};

test("application compact rule builder compresses typed input and enter into a reusable high level trace", () => {
  const result = new SopRuleCompactBuilder().build(trace);

  assert.equal(result.stepCount, 4);
  assert.deepEqual(result.tabs, ["tab-1"]);
  assert.deepEqual(result.highSteps, [
    "切换到 tab-1",
    '在 选择器 "#query" 输入“coffee”',
    "按下 Enter",
    '点击 选择器 "#submit"',
  ]);
});

test("runtime compact rule builder is a shim over the application compact rule builder", () => {
  assert.equal(RuntimeSopRuleCompactBuilder, SopRuleCompactBuilder);
});
