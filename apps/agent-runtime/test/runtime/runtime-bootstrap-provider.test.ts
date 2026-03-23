import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { RuntimeBootstrapProvider } from "../../src/infrastructure/config/runtime-bootstrap-provider.js";

test("runtime bootstrap provider returns raw config sources and resolved project root", async () => {
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
      LLM_MODEL: "env-model",
    },
  });

  const loaded = provider.load();

  assert.equal(loaded.configPath, configPath);
  assert.equal(loaded.projectRoot, root);
  assert.equal(loaded.env.MCP_COMMAND, "env-mcp");
  assert.equal(loaded.env.LLM_MODEL, "env-model");
  assert.equal(loaded.file?.llm?.model, "file-model");
  assert.equal(loaded.file?.runtime?.artifactsDir, "custom-artifacts");
  assert.equal("model" in loaded, false);
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

  const loaded = provider.load();

  assert.equal(loaded.configPath, path.join(root, "config", "runtime.local.json"));
  assert.equal(loaded.projectRoot, root);
  assert.equal(loaded.file?.llm?.model, "explicit-relative-model");
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

  const loaded = provider.load();

  assert.equal(loaded.configPath, path.join(root, "config", "runtime.env.json"));
  assert.equal(loaded.projectRoot, root);
  assert.equal(loaded.file?.llm?.model, "env-relative-model");
});

test("runtime bootstrap provider returns env-only sources when no config file exists", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sasiki-bootstrap-no-file-"));
  await mkdir(path.join(root, ".git"));

  const provider = new RuntimeBootstrapProvider({
    cwd: root,
    env: {
      LLM_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
  });

  const loaded = provider.load();

  assert.equal(loaded.configPath, undefined);
  assert.equal(loaded.projectRoot, root);
  assert.equal(loaded.file, undefined);
  assert.equal(loaded.env.LLM_BASE_URL, "https://dashscope.aliyuncs.com/compatible-mode/v1");
});
