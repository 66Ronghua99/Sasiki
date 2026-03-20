import assert from "node:assert/strict";
import test from "node:test";

import { PromptProvider } from "../../../src/application/refine/prompt-provider.js";
import {
  REFINE_REACT_SYSTEM_PROMPT,
  RUN_OPERATOR_SYSTEM_PROMPT,
} from "../../../src/application/refine/system-prompts.js";

test("prompt provider resolves refine-owned canonical prompt assets by default", () => {
  const provider = new PromptProvider();

  const prompts = provider.resolve({
    runSystemPrompt: undefined,
    refineSystemPrompt: undefined,
  });

  assert.equal(prompts.runSystemPrompt, RUN_OPERATOR_SYSTEM_PROMPT);
  assert.equal(prompts.refineSystemPrompt, REFINE_REACT_SYSTEM_PROMPT);
});

test("prompt provider preserves explicit prompt overrides", () => {
  const provider = new PromptProvider();

  const prompts = provider.resolve({
    runSystemPrompt: "custom run prompt",
    refineSystemPrompt: "custom refine prompt",
  });

  assert.deepEqual(prompts, {
    runSystemPrompt: "custom run prompt",
    refineSystemPrompt: "custom refine prompt",
  });
});
