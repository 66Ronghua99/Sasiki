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

test("start prompt includes the initial observation and re-observe rules", () => {
  const provider = new PromptProvider();

  const prompt = provider.buildRefineStartPrompt({
    task: "check inbox",
    guidance: "reuse known message entry point",
    resumeInstruction: "",
    initialObservation: {
      observationRef: "obs_run_1_1",
      page: {
        url: "https://seller.example.com/homepage",
        origin: "https://seller.example.com",
        normalizedPath: "/homepage",
        title: "Seller Center",
      },
      activeTabIndex: 0,
      openTabCount: 2,
    },
  });

  assert.match(prompt, /observationRef: obs_run_1_1/);
  assert.match(prompt, /observe\.query only searches the latest captured snapshot/);
  assert.match(prompt, /After act\.navigate, act\.select_tab, or any click that changes page\/tab context, call observe\.page/);
  assert.match(prompt, /verified empty state after checking the relevant tabs or filters is a valid completion/);
});

test("refine system prompt teaches readiness-aware observation handling", () => {
  const provider = new PromptProvider();

  const prompts = provider.resolve({
    runSystemPrompt: undefined,
    refineSystemPrompt: undefined,
  });

  assert.match(
    prompts.refineSystemPrompt,
    /observationReadiness = ready means the observation is safe to reason over/,
  );
  assert.match(
    prompts.refineSystemPrompt,
    /observationReadiness = incomplete means it should avoid over-trusting the current observation/,
  );
});
