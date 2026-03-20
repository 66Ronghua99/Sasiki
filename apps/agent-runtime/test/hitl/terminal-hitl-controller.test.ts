import assert from "node:assert/strict";
import test from "node:test";

import type { HitlInterventionRequest } from "../../src/domain/intervention-learning.js";
import { renderTerminalHitlNarrative } from "../../src/infrastructure/hitl/terminal-hitl-controller.js";

function buildRequest(overrides: Partial<HitlInterventionRequest> = {}): HitlInterventionRequest {
  return {
    runId: "run_123",
    attempt: 1,
    issueType: "uncertain_state",
    operationIntent: "Open Xiaohongshu and save an image-text draft",
    failureReason: "The upload button was not clickable from the current viewport.",
    beforeState: "Editor home is visible and draft box button is present.",
    context: {
      elementHint: "upload image-text button",
      inputVariable: "draft title",
    },
    ...overrides,
  };
}

test("terminal HITL narrative presents a natural-language incident brief", () => {
  const output = renderTerminalHitlNarrative(buildRequest());
  assert.match(output, /Human Help Needed/);
  assert.match(output, /Run run_123 \(attempt 1\) is paused for manual assistance/);
  assert.match(output, /I am working on: Open Xiaohongshu and save an image-text draft/);
  assert.match(output, /I got blocked because: The upload button was not clickable from the current viewport/);
  assert.match(output, /Potential target hint: upload image-text button/);
  assert.match(output, /Input variable hint: draft title/);
});

test("terminal HITL narrative does not expose legacy structured field labels", () => {
  const output = renderTerminalHitlNarrative(buildRequest());
  assert.equal(output.includes("issueType:"), false);
  assert.equal(output.includes("failureReason:"), false);
  assert.equal(output.includes("operationIntent:"), false);
  assert.equal(output.includes("beforeState:"), false);
  assert.equal(output.includes("Human action taken:"), false);
  assert.equal(output.includes("Reusable next-time rule:"), false);
  assert.equal(output.includes("Resume instruction"), false);
});

test("terminal HITL narrative falls back safely when optional fields are empty", () => {
  const output = renderTerminalHitlNarrative(
    buildRequest({
      operationIntent: "",
      failureReason: "",
      beforeState: "",
      context: {},
    })
  );
  assert.match(output, /the current task/);
  assert.match(output, /the latest action could not continue safely/);
  assert.match(output, /\(unavailable\)/);
});
