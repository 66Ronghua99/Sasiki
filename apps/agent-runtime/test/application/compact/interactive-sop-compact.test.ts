import assert from "node:assert/strict";
import test from "node:test";

import {
  FINALIZE_SYSTEM_PROMPT,
  REASONER_SYSTEM_PROMPT,
  SUMMARIZE_SYSTEM_PROMPT,
} from "../../../src/application/compact/interactive-sop-compact-prompts.js";
import { InteractiveSopCompactService } from "../../../src/application/compact/interactive-sop-compact.js";
import { SopRuleCompactBuilder } from "../../../src/application/compact/sop-rule-compact-builder.js";
import {
  FINALIZE_SYSTEM_PROMPT as runtimeFinalizeSystemPrompt,
  REASONER_SYSTEM_PROMPT as runtimeReasonerSystemPrompt,
  SUMMARIZE_SYSTEM_PROMPT as runtimeSummarizeSystemPrompt,
} from "../../../src/runtime/interactive-sop-compact-prompts.js";
import { InteractiveSopCompactService as RuntimeInteractiveSopCompactService } from "../../../src/runtime/interactive-sop-compact.js";
import { SopRuleCompactBuilder as RuntimeSopRuleCompactBuilder } from "../../../src/runtime/sop-rule-compact-builder.js";

test("application compact service and prompts are the canonical home", () => {
  assert.equal(RuntimeInteractiveSopCompactService, InteractiveSopCompactService);
  assert.equal(RuntimeSopRuleCompactBuilder, SopRuleCompactBuilder);
  assert.equal(runtimeReasonerSystemPrompt, REASONER_SYSTEM_PROMPT);
  assert.equal(runtimeSummarizeSystemPrompt, SUMMARIZE_SYSTEM_PROMPT);
  assert.equal(runtimeFinalizeSystemPrompt, FINALIZE_SYSTEM_PROMPT);
});
