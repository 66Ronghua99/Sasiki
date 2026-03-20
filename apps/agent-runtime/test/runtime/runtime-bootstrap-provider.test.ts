import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { RuntimeConfigLoader } from "../../src/application/config/runtime-config.js";
import { RuntimeBootstrapProvider } from "../../src/infrastructure/config/runtime-bootstrap-provider.js";

test("runtime bootstrap provider prefers file config over env and resolves relative artifacts under project root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sasiki-bootstrap-"));
  await mkdir(path.join(root, ".git"));

  const configPath = path.join(root, "runtime.config.json");
  await writeFile(
    configPath,
    JSON.stringify(
      {
        llm: {
          model: "file-model",
          apiKey: "file-key",
          baseUrl: "https://file.example/v1",
          thinkingLevel: "high",
        },
        mcp: {
          command: "file-mcp",
          args: ["file-arg-a", "file-arg-b"],
          env: {
            FILE_ONLY: "1",
          },
        },
        cdp: {
          endpoint: "http://127.0.0.1:9333",
          launch: false,
          headless: true,
          resetPagesOnLaunch: false,
          injectCookies: false,
        },
        runtime: {
          artifactsDir: "custom-artifacts",
          runSystemPrompt: "file run prompt",
          refineSystemPrompt: "file refine prompt",
        },
        observe: {
          timeoutMs: 4567,
        },
        semantic: {
          mode: "on",
          timeoutMs: 2345,
        },
        hitl: {
          enabled: true,
          retryLimit: 5,
          maxInterventions: 3,
        },
        refinement: {
          enabled: true,
          mode: "full_snapshot_debug",
          maxRounds: 9,
          tokenBudget: 321,
          knowledgeTopN: 4,
        },
      },
      null,
      2
    )
  );

  const provider = new RuntimeBootstrapProvider({
    configPath,
    cwd: root,
    env: {
      MCP_COMMAND: "env-mcp",
      MCP_ARGS: "env-arg-a env-arg-b",
      PLAYWRIGHT_MCP_CDP_ENDPOINT: "http://127.0.0.1:9222",
      LAUNCH_CDP: "true",
      CDP_USER_DATA_DIR: "~/.should-not-win",
      CDP_HEADLESS: "false",
      INJECT_COOKIES: "true",
      COOKIES_DIR: "~/.should-not-win",
      PREFER_SYSTEM_BROWSER: "true",
      CHROME_EXECUTABLE_PATH: "/env/chrome",
      CDP_STARTUP_TIMEOUT_MS: "7777",
      LLM_MODEL: "env-model",
      LLM_API_KEY: "env-key",
      LLM_BASE_URL: "https://env.example/v1",
      LLM_THINKING_LEVEL: "minimal",
      RUNTIME_ARTIFACTS_DIR: "env-artifacts",
      RUNTIME_RUN_SYSTEM_PROMPT: "env run prompt",
      RUNTIME_REFINE_SYSTEM_PROMPT: "env refine prompt",
      OBSERVE_TIMEOUT_MS: "9999",
      SOP_COMPACT_SEMANTIC_MODE: "off",
      SOP_COMPACT_SEMANTIC_TIMEOUT_MS: "8888",
      HITL_ENABLED: "false",
      HITL_RETRY_LIMIT: "1",
      HITL_MAX_INTERVENTIONS: "0",
      REFINEMENT_ENABLED: "false",
      REFINEMENT_MODE: "filtered_view",
      REFINEMENT_MAX_ROUNDS: "1",
      REFINEMENT_TOKEN_BUDGET: "2",
      REFINEMENT_KNOWLEDGE_TOP_N: "3",
    },
  });

  const config = provider.load();

  assert.equal(config.configPath, configPath);
  assert.equal(config.mcpCommand, "file-mcp");
  assert.deepEqual(config.mcpArgs, ["file-arg-a", "file-arg-b"]);
  assert.deepEqual(config.mcpEnv, { FILE_ONLY: "1" });
  assert.equal(config.cdpEndpoint, "http://127.0.0.1:9333");
  assert.equal(config.launchCdp, false);
  assert.equal(config.cdpHeadless, true);
  assert.equal(config.cdpResetPagesOnLaunch, false);
  assert.equal(config.cdpInjectCookies, false);
  assert.equal(config.cdpExecutablePath, "/env/chrome");
  assert.equal(config.model, "file-model");
  assert.equal(config.apiKey, "file-key");
  assert.equal(config.baseUrl, "https://file.example/v1");
  assert.equal(config.thinkingLevel, "high");
  assert.equal(config.artifactsDir, path.join(root, "custom-artifacts"));
  assert.equal(config.runSystemPrompt, "file run prompt");
  assert.equal(config.refineSystemPrompt, "file refine prompt");
  assert.equal(config.observeTimeoutMs, 4567);
  assert.equal(config.sopAssetRootDir, "~/.sasiki/sop_assets");
  assert.equal(config.semanticMode, "on");
  assert.equal(config.semanticTimeoutMs, 2345);
  assert.equal("sopConsumptionEnabled" in config, false);
  assert.equal("sopConsumptionTopN" in config, false);
  assert.equal("sopConsumptionHintsLimit" in config, false);
  assert.equal("sopConsumptionMaxGuideChars" in config, false);
  assert.equal(config.hitlEnabled, true);
  assert.equal(config.hitlRetryLimit, 5);
  assert.equal(config.hitlMaxInterventions, 3);
  assert.equal(config.refinementEnabled, true);
  assert.equal(config.refinementMode, "full_snapshot_debug");
  assert.equal(config.refinementMaxRounds, 9);
  assert.equal(config.refinementTokenBudget, 321);
  assert.equal(config.refinementKnowledgeTopN, 4);
});

test("runtime bootstrap provider falls back to env-driven defaults when file omits fields", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sasiki-bootstrap-defaults-"));
  await mkdir(path.join(root, ".git"));

  const configPath = path.join(root, "runtime.config.json");
  await writeFile(configPath, JSON.stringify({}));

  const provider = new RuntimeBootstrapProvider({
    configPath,
    cwd: root,
    env: {
      LLM_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      MCP_ARGS: "one two",
      SOP_CONSUMPTION_ENABLED: "yes",
      RUNTIME_ARTIFACTS_DIR: "relative-artifacts",
    },
  });

  const config = provider.load();

  assert.equal(config.model, "openai/qwen-plus");
  assert.equal(config.mcpCommand, "npx");
  assert.deepEqual(config.mcpArgs, ["one", "two"]);
  assert.equal(config.cdpEndpoint, "http://localhost:9222");
  assert.equal(config.launchCdp, true);
  assert.equal(config.artifactsDir, path.join(root, "relative-artifacts"));
  assert.equal("sopConsumptionEnabled" in config, false);
  assert.equal(config.refinementEnabled, false);
});

test("runtime bootstrap provider resolves explicit relative configPath against injected cwd", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sasiki-bootstrap-relative-explicit-"));
  await mkdir(path.join(root, ".git"));
  await mkdir(path.join(root, "config"));

  await writeFile(
    path.join(root, "config", "runtime.local.json"),
    JSON.stringify({
      llm: {
        model: "explicit-relative-model",
      },
    })
  );

  const provider = new RuntimeBootstrapProvider({
    configPath: "config/runtime.local.json",
    cwd: root,
    env: {},
  });

  const config = provider.load();

  assert.equal(config.configPath, path.join(root, "config", "runtime.local.json"));
  assert.equal(config.model, "explicit-relative-model");
});

test("runtime bootstrap provider resolves relative RUNTIME_CONFIG_PATH against injected cwd", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sasiki-bootstrap-relative-env-"));
  await mkdir(path.join(root, ".git"));
  await mkdir(path.join(root, "config"));

  await writeFile(
    path.join(root, "config", "runtime.env.json"),
    JSON.stringify({
      llm: {
        model: "env-relative-model",
      },
    })
  );

  const provider = new RuntimeBootstrapProvider({
    cwd: root,
    env: {
      RUNTIME_CONFIG_PATH: "config/runtime.env.json",
    },
  });

  const config = provider.load();

  assert.equal(config.configPath, path.join(root, "config", "runtime.env.json"));
  assert.equal(config.model, "env-relative-model");
});

test("runtime config loader uses the canonical application config home", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sasiki-runtime-config-loader-"));
  await mkdir(path.join(root, ".git"));

  const configPath = path.join(root, "runtime.config.json");
  await writeFile(
    configPath,
    JSON.stringify({
      llm: {
        model: "loader-model",
      },
      runtime: {
        artifactsDir: "loader-artifacts",
      },
    })
  );

  const config = RuntimeConfigLoader.fromSources({
    configPath,
    cwd: root,
    env: {},
  });

  assert.equal(config.configPath, configPath);
  assert.equal(config.model, "loader-model");
  assert.equal(config.artifactsDir, path.join(root, "loader-artifacts"));
});
