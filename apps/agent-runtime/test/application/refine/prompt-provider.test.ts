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

test("start prompt includes durable SOP usage, recovery, and empty-state rules", () => {
  const provider = new PromptProvider();

  const prompt = provider.buildRefineStartPrompt({
    task: "check inbox",
    guidance: "reuse known message entry point",
    availableSkills: [
      {
        name: "tiktok-customer-service",
        description: "Check whether new customer chats need handling.",
      },
      {
        name: "xiaohongshu-publish",
        description: "Draft and publish a Xiaohongshu post.",
      },
    ],
    selectedSkillName: "tiktok-customer-service",
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
  assert.match(prompt, /Available SOP skills:/);
  assert.match(prompt, /tiktok-customer-service: Check whether new customer chats need handling\./);
  assert.match(prompt, /Requested SOP skill: tiktok-customer-service/);
  assert.match(prompt, /A skill explains when a workflow applies, what outcome it is for, durable constraints, likely recovery cues, and valid completion signals/);
  assert.match(prompt, /These startup SOP entries are metadata only; the durable workflow body is not preloaded/);
  assert.match(prompt, /Use skill\.reader proactively and early when a requested or clearly relevant SOP skill applies, or when you need to disambiguate recovery or completion behavior/);
  assert.match(prompt, /Load the requested SOP body with skill\.reader early before you rely on tiktok-customer-service-specific details/);
  assert.match(prompt, /Metadata is only the skill index, not the full workflow/);
  assert.match(prompt, /observe\.query only searches the latest captured snapshot/);
  assert.match(prompt, /After act\.navigate, act\.select_tab, or any click that changes page\/tab context, call observe\.page/);
  assert.match(prompt, /Treat the user task as the desired outcome, not as a place to request fallback navigation scripts/);
  assert.match(prompt, /If navigation lands on an unexpected page, redirect, or path mismatch, recover with fresh observation/);
  assert.match(prompt, /If fresh observation disagrees with a skill, stay grounded in the page state and adapt/);
  assert.match(prompt, /A corroborated empty state after checking the relevant tabs or filters is a valid completion/);
  assert.match(prompt, /visible empty-state DOM or consistent pageKnowledge cues/);
});

test("refine system prompt uses explicit hierarchy and concise durable skill guidance", () => {
  const provider = new PromptProvider();

  const prompts = provider.resolve({
    runSystemPrompt: undefined,
    refineSystemPrompt: undefined,
  });

  assert.match(
    prompts.refineSystemPrompt,
    /## Core Mission[\s\S]*### Project Background[\s\S]*### High-Level Goals/,
  );
  assert.match(
    prompts.refineSystemPrompt,
    /## Knowledge Model[\s\S]*### What Attention Means[\s\S]*### Why Attention Matters[\s\S]*### How Attention Is Used Later/,
  );
  assert.match(
    prompts.refineSystemPrompt,
    /## Role Contract[\s\S]*### Positioning[\s\S]*### Responsibilities[\s\S]*### Boundaries/,
  );
  assert.match(
    prompts.refineSystemPrompt,
    /## Operating Rules[\s\S]*### Working Guidelines[\s\S]*### SOP Skill Guidance[\s\S]*### HITL Guidelines/,
  );
  assert.match(
    prompts.refineSystemPrompt,
    /## Completion Policy/,
  );
  assert.match(
    prompts.refineSystemPrompt,
    /An SOP skill is a durable workflow document distilled from prior runs/,
  );
  assert.match(
    prompts.refineSystemPrompt,
    /Treat metadata as an index, not as the workflow itself\. Load the full skill body before making skill-specific decisions/,
  );
  assert.match(
    prompts.refineSystemPrompt,
    /Use `skill\.reader` early when a skill is explicitly requested, clearly relevant, or needed to resolve recovery or completion behavior/,
  );
  assert.match(
    prompts.refineSystemPrompt,
    /Treat the user prompt as outcome-focused intent; handle redirects or path mismatches through grounded observation plus the relevant SOP skill/,
  );
  assert.match(
    prompts.refineSystemPrompt,
    /observationReadiness = ready means the observation is safe to reason over/,
  );
  assert.match(
    prompts.refineSystemPrompt,
    /observationReadiness = incomplete means it should avoid over-trusting the current observation/,
  );
  assert.match(
    prompts.refineSystemPrompt,
    /Treat corroborated empty states as real outcomes/,
  );
});
