import assert from "node:assert/strict";
import test from "node:test";

import {
  isObservePageResponse,
  isObserveQueryResponse,
  type ActionExecutionResult,
} from "../../src/domain/refine-react.js";
import { REFINE_TOOL_ORDER } from "../../src/application/refine/tools/refine-tool-order.js";
import { ATTENTION_KNOWLEDGE_CATEGORIES } from "../../src/domain/attention-knowledge.js";
import { isPausedHitlStatus, type AgentRunResult } from "../../src/domain/agent-types.js";

test("observe.page contract includes required page identity and snapshot fields", () => {
  const response = {
    observation: {
      observationRef: "obs-1",
      capturedAt: "2026-03-20T10:00:00.000Z",
      page: {
        url: "https://www.xiaohongshu.com/explore",
        origin: "https://www.xiaohongshu.com",
        normalizedPath: "/explore",
        title: "Explore",
      },
      snapshot: "<page snapshot>",
    },
  };

  assert.equal(isObservePageResponse(response), true);
  assert.equal(
    isObservePageResponse({
      observation: {
        ...response.observation,
        page: {
          ...response.observation.page,
          title: "",
        },
      },
    }),
    false,
    "title is required by frozen observe.page contract"
  );
});

test("observe.query contract requires sourceObservationRef and normalized text fields", () => {
  const response = {
    observationRef: "obs-1",
    page: {
      origin: "https://www.xiaohongshu.com",
      normalizedPath: "/explore",
    },
    matches: [
      {
        elementRef: "el-1",
        sourceObservationRef: "obs-1",
        role: "button",
        rawText: "关注",
        normalizedText: "关注",
      },
    ],
  };

  assert.equal(isObserveQueryResponse(response), true);
  assert.equal(
    isObserveQueryResponse({
      ...response,
      matches: [
        {
          ...response.matches[0],
          sourceObservationRef: "",
        },
      ],
    }),
    false,
    "sourceObservationRef must be present for provenance"
  );
});

test("paused HITL uses explicit paused status instead of completed or failed", () => {
  const pausedResult: AgentRunResult = {
    task: "need human confirmation",
    status: "paused_hitl",
    finishReason: "hitl.request paused for human input",
    steps: [],
    mcpCalls: [],
    assistantTurns: [],
    resumeRunId: "run_123",
    resumeToken: "resume_token_123",
  };

  assert.equal(isPausedHitlStatus(pausedResult.status), true);
  assert.notEqual(pausedResult.status, "completed");
  assert.notEqual(pausedResult.status, "failed");
});

test("attention knowledge categories are frozen to v1 contract", () => {
  assert.deepEqual(ATTENTION_KNOWLEDGE_CATEGORIES, ["keep", "ignore", "action-target", "success-indicator"]);
});

test("refine-react tool surface includes screenshot, tab-select, and file-upload actions", () => {
  assert.ok(REFINE_TOOL_ORDER.includes("act.screenshot"));
  assert.ok(REFINE_TOOL_ORDER.includes("act.select_tab"));
  assert.ok(REFINE_TOOL_ORDER.includes("act.file_upload"));
});

test("action execution result action enum includes screenshot, tab-select, and file-upload", () => {
  const screenshotAction: ActionExecutionResult["action"] = "screenshot";
  const selectTabAction: ActionExecutionResult["action"] = "select_tab";
  const fileUploadAction: ActionExecutionResult["action"] = "file_upload";
  assert.equal(screenshotAction, "screenshot");
  assert.equal(selectTabAction, "select_tab");
  assert.equal(fileUploadAction, "file_upload");
});
