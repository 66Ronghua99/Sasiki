import assert from "node:assert/strict";
import test from "node:test";

import {
  FINALIZE_SYSTEM_PROMPT,
  REASONER_SYSTEM_PROMPT,
  SUMMARIZE_SYSTEM_PROMPT,
} from "../../../src/application/compact/interactive-sop-compact-prompts.js";
import { InteractiveSopCompactService } from "../../../src/application/compact/interactive-sop-compact.js";
import { SopRuleCompactBuilder } from "../../../src/application/compact/sop-rule-compact-builder.js";

test("application compact service and prompts are the canonical home", () => {
  assert.equal(typeof InteractiveSopCompactService, "function");
  assert.equal(typeof SopRuleCompactBuilder, "function");
  assert.match(REASONER_SYSTEM_PROMPT, /SOP compact reasoning agent/i);
  assert.match(SUMMARIZE_SYSTEM_PROMPT, /machine-readable state update/i);
  assert.match(FINALIZE_SYSTEM_PROMPT, /finalizing a reusable SOP compact capability/i);
});
