import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createRuntimeComposition, planRuntimeComposition } from "../../src/application/shell/runtime-composition-root.js";
import type { RuntimeConfig } from "../../src/application/config/runtime-config.js";

function buildRuntimeConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    configPath: undefined,
    mcpCommand: "npx",
    mcpArgs: ["@playwright/mcp@latest"],
    mcpEnv: {},
    cdpEndpoint: "http://localhost:9222",
    launchCdp: false,
    cdpUserDataDir: "~/.sasiki/chrome_profile",
    cdpResetPagesOnLaunch: true,
    cdpHeadless: false,
    cdpInjectCookies: true,
    cdpCookiesDir: "~/.sasiki/cookies",
    cdpPreferSystemBrowser: true,
    cdpExecutablePath: undefined,
    cdpStartupTimeoutMs: 30000,
    model: "openai/gpt-4o-mini",
    apiKey: "test-key",
    baseUrl: undefined,
    thinkingLevel: "minimal",
    artifactsDir: path.join(process.cwd(), "artifacts", "test-runtime-composition"),
    runSystemPrompt: undefined,
    refineSystemPrompt: undefined,
    observeTimeoutMs: 120000,
    sopAssetRootDir: "~/.sasiki/sop_assets",
    semanticMode: "auto",
    semanticTimeoutMs: 12000,
    hitlEnabled: false,
    hitlRetryLimit: 2,
    hitlMaxInterventions: 1,
    refinementEnabled: false,
    refinementMode: "filtered_view",
    refinementMaxRounds: 12,
    refinementTokenBudget: 1000,
    refinementKnowledgeTopN: 8,
    ...overrides,
  };
}

test("planRuntimeComposition keeps refine-react as the only active agent runtime surface", () => {
  const plan = planRuntimeComposition(buildRuntimeConfig({ refinementEnabled: false }));

  assert.equal(plan.runExecutorKind, "refine");
  assert.equal(plan.toolSurfaceKind, "refine-react");
  assert.match(plan.prompts.runSystemPrompt, /Sasiki Browser Operator/);
  assert.match(plan.prompts.refineSystemPrompt, /Sasiki Refine Agent/);
});

test("planRuntimeComposition selects refine-react surface and respects prompt overrides", () => {
  const plan = planRuntimeComposition(
    buildRuntimeConfig({
      refinementEnabled: true,
      runSystemPrompt: "custom run prompt",
      refineSystemPrompt: "custom refine prompt",
    })
  );

  assert.equal(plan.runExecutorKind, "refine");
  assert.equal(plan.toolSurfaceKind, "refine-react");
  assert.equal(plan.prompts.runSystemPrompt, "custom run prompt");
  assert.equal(plan.prompts.refineSystemPrompt, "custom refine prompt");
});

test("createRuntimeComposition builds runtime services for both legacy and refine modes", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-runtime-composition-"));

  const compatConfig = createRuntimeComposition(
    buildRuntimeConfig({
      artifactsDir: path.join(tmpRoot, "compat"),
      refinementEnabled: false,
    })
  );
  const refine = createRuntimeComposition(
    buildRuntimeConfig({
      artifactsDir: path.join(tmpRoot, "refine"),
      refinementEnabled: true,
    })
  );

  assert.equal(typeof compatConfig.browserLifecycle.start, "function");
  assert.equal(typeof compatConfig.agentRuntime.run, "function");
  assert.equal(typeof compatConfig.observeRuntime.observe, "function");

  assert.equal(typeof refine.browserLifecycle.start, "function");
  assert.equal(typeof refine.agentRuntime.run, "function");
  assert.equal(typeof refine.observeRuntime.observe, "function");

  await compatConfig.agentRuntime.stop();
  await refine.agentRuntime.stop();
});
