import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { RuntimeConfigLoader } from "../../src/application/config/runtime-config-loader.js";

test("runtime config loader resolves telemetry defaults from the canonical config contract", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sasiki-runtime-config-loader-"));
  await mkdir(path.join(root, ".git"));

  const configPath = path.join(root, "runtime.config.json");
  await writeFile(configPath, JSON.stringify({}));

  const config = RuntimeConfigLoader.fromSources({
    configPath,
    cwd: root,
    env: {},
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

test("runtime config loader rejects invalid telemetry enum values", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sasiki-runtime-config-loader-invalid-"));
  await mkdir(path.join(root, ".git"));

  const configPath = path.join(root, "runtime.config.json");
  await writeFile(
    configPath,
    JSON.stringify({
      telemetry: {
        terminal: {
          mode: "verbose",
        },
      },
    })
  );

  assert.throws(
    () =>
      RuntimeConfigLoader.fromSources({
        configPath,
        cwd: root,
        env: {},
      }),
    /invalid telemetry\.terminal\.mode/i
  );
});
