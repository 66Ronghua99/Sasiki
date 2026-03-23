import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { RuntimeConfigLoader } from "../../src/application/config/runtime-config-loader.js";
import { loadRuntimeConfig } from "../../src/application/shell/runtime-config-bootstrap.js";

test("runtime config loader normalizes telemetry defaults from raw bootstrap sources", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sasiki-runtime-config-loader-"));
  await mkdir(path.join(root, ".git"));

  const configPath = path.join(root, "runtime.config.json");
  await writeFile(configPath, JSON.stringify({}));

  const config = RuntimeConfigLoader.fromBootstrapSources({
    configPath,
    env: {},
    file: {},
    projectRoot: root,
  }) as {
    telemetry: {
      terminalEnabled: boolean;
      terminalMode: string;
      artifactEventStreamEnabled: boolean;
      artifactCheckpointMode: string;
    };
  };

  assert.equal(config.telemetry.terminalEnabled, true);
  assert.equal(config.telemetry.terminalMode, "agent");
  assert.equal(config.telemetry.artifactEventStreamEnabled, true);
  assert.equal(config.telemetry.artifactCheckpointMode, "key_turns");
});

test("runtime config loader rejects invalid telemetry enum values from raw bootstrap sources", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sasiki-runtime-config-loader-invalid-"));
  await mkdir(path.join(root, ".git"));

  const configPath = path.join(root, "runtime.config.json");
  await writeFile(configPath, JSON.stringify({}));

  assert.throws(
    () =>
      RuntimeConfigLoader.fromBootstrapSources({
        configPath,
        env: {},
        file: {
          telemetry: {
            terminal: {
              mode: "verbose",
            },
          },
        },
        projectRoot: root,
      }),
    /invalid telemetry\.terminal\.mode/i
  );
});

test("runtime config bootstrap loads raw sources in shell and normalizes them through application config", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sasiki-runtime-config-bootstrap-"));
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

  const config = loadRuntimeConfig({
    configPath,
    cwd: root,
    env: {},
  });

  assert.equal(config.configPath, configPath);
  assert.equal(config.model, "loader-model");
  assert.equal(config.artifactsDir, path.join(root, "loader-artifacts"));
});
