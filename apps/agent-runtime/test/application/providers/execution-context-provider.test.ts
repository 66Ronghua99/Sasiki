import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ExecutionContextProvider } from "../../../src/application/providers/execution-context-provider.js";
import type { RuntimeConfig } from "../../../src/application/config/runtime-config.js";
import type { AttentionKnowledge } from "../../../src/domain/attention-knowledge.js";

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
    artifactsDir: path.join(process.cwd(), "artifacts", "test-application-provider-context"),
    runSystemPrompt: undefined,
    refineSystemPrompt: undefined,
    observeTimeoutMs: 120000,
    sopAssetRootDir: path.join(process.cwd(), "artifacts", "test-application-provider-context", "sop-assets"),
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

test("execution context provider canonical home wires persistence paths under artifacts", async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "sasiki-execution-context-"));
  const config = buildRuntimeConfig({
    artifactsDir: path.join(tmpRoot, "artifacts"),
    sopAssetRootDir: path.join(tmpRoot, "sop-assets"),
  });

  const provider = new ExecutionContextProvider();
  const refinementContext = provider.createRefinementContext(config);

  const knowledge: AttentionKnowledge = {
    id: "knowledge-1",
    sourceRunId: "run-1",
    taskScope: "search",
    page: {
      origin: "https://example.com",
      normalizedPath: "/",
    },
    category: "keep",
    cue: "keep the hero button visible",
    sourceObservationRef: "obs-1",
    promotedAt: new Date("2026-03-21T00:00:01.000Z").toISOString(),
  };
  await refinementContext.knowledgeStore.append([knowledge]);
  const loaded = await refinementContext.guidanceLoader.load({
    taskScope: "search",
    page: {
      origin: "https://example.com",
      normalizedPath: "/",
    },
  });

  const resumePath = await refinementContext.hitlResumeStore.save({
    runId: "run-1",
    task: "save this page",
    prompt: "resume prompt",
    resumeToken: "resume-token",
    createdAt: new Date("2026-03-21T00:00:02.000Z").toISOString(),
  });

  assert.equal(loaded.records.length, 1);
  assert.match(loaded.guidance, /keep the hero button visible/);
  assert.equal(resumePath, path.join(tmpRoot, "artifacts", "run-1", "hitl_resume.json"));
});
