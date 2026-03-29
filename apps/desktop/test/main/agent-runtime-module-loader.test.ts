import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test } from "vitest";
import {
  loadAgentRuntimeModule,
  resolveAgentRuntimeDistRoot,
} from "../../main/agent-runtime-module-loader";

describe("agent runtime module loader", () => {
  test("resolves the agent runtime dist root from source main files", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "sasiki-agent-runtime-module-loader-"));
    const moduleDir = join(workspaceRoot, "apps", "desktop", "main", "skills");

    await mkdir(join(workspaceRoot, "apps", "agent-runtime"), { recursive: true });
    await writeFile(join(workspaceRoot, "apps", "agent-runtime", "package.json"), "{}", "utf8");

    assert.equal(resolveAgentRuntimeDistRoot(moduleDir), join(workspaceRoot, "apps", "agent-runtime", "dist"));
  });

  test("resolves the agent runtime dist root from built desktop output files", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "sasiki-agent-runtime-module-loader-"));
    const moduleDir = join(workspaceRoot, "apps", "desktop", "out", "main", "skills");

    await mkdir(join(workspaceRoot, "apps", "agent-runtime"), { recursive: true });
    await writeFile(join(workspaceRoot, "apps", "agent-runtime", "package.json"), "{}", "utf8");

    assert.equal(resolveAgentRuntimeDistRoot(moduleDir), join(workspaceRoot, "apps", "agent-runtime", "dist"));
  });

  test("loads a runtime dist module directly from the resolved dist tree", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "sasiki-agent-runtime-module-loader-"));
    const distRoot = join(rootDir, "apps", "agent-runtime", "dist");
    const modulePath = "infrastructure/persistence/sop-skill-store.js";
    const moduleFile = join(distRoot, modulePath);

    await mkdir(dirname(moduleFile), { recursive: true });
    await writeFile(
      moduleFile,
      [
        "export class SopSkillStore {",
        "  constructor(rootDir) {",
        "    this.rootDir = rootDir;",
        "  }",
        "",
        "  async listMetadata() {",
        "    return [{ name: 'loader-skill', description: this.rootDir }];",
        "  }",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const module = await loadAgentRuntimeModule<{
      SopSkillStore: new (rootDir?: string) => { listMetadata(): Promise<Array<{ name: string; description: string }>> };
    }>(distRoot, modulePath);

    const store = new module.SopSkillStore("/Users/cory/.sasiki/skills");
    assert.deepEqual(await store.listMetadata(), [
      { name: "loader-skill", description: "/Users/cory/.sasiki/skills" },
    ]);
  });
});
