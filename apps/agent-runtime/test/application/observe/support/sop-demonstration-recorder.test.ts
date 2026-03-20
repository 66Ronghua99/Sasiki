import assert from "node:assert/strict";
import test from "node:test";

import { SopDemonstrationRecorder } from "../../../../src/application/observe/support/sop-demonstration-recorder.js";
import type { SopTrace } from "../../../../src/domain/sop-trace.js";

test("application observe support builds drafts and hints from canonical recorder helpers", () => {
  const recorder = new SopDemonstrationRecorder();
  const trace: SopTrace = {
    traceVersion: "v0",
    traceId: "trace-1",
    mode: "observe",
    site: "example.com",
    singleTabOnly: true,
    taskHint: "record the homepage",
    steps: [
      {
        stepIndex: 1,
        timestamp: "2026-03-21T00:00:00.000Z",
        action: "click",
        tabId: "tab-1",
        target: { type: "selector", value: "#submit" },
        input: { roleHint: "button", textHint: "submit" },
        page: { urlBefore: "about:blank", urlAfter: "https://example.com/" },
        rawRef: "event-1",
      },
      {
        stepIndex: 2,
        timestamp: "2026-03-21T00:00:01.000Z",
        action: "type",
        tabId: "tab-1",
        target: { type: "selector", value: "#query" },
        input: { value: "hello", roleHint: "searchbox", textHint: "query" },
        page: { urlBefore: "https://example.com/", urlAfter: "https://example.com/" },
        rawRef: "event-2",
      },
    ],
  };

  const draft = recorder.buildDraft(trace);
  const hints = recorder.buildWebElementHints(trace);
  const tags = recorder.buildTags(trace);

  assert.match(draft, /trace-1/);
  assert.equal(hints.length, 2);
  assert.deepEqual(tags, ["click", "interaction", "type"]);
});
