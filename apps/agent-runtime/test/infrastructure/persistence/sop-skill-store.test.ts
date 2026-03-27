import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { SopSkillStore } from "../../../src/infrastructure/persistence/sop-skill-store.js";
import { SopSkillStoreError } from "../../../src/domain/sop-skill.js";

async function createSkillFile(
  rootDir: string,
  skillName: string,
  content: string
): Promise<string> {
  const skillDir = path.join(rootDir, skillName);
  await mkdir(skillDir, { recursive: true });
  const skillPath = path.join(skillDir, "SKILL.md");
  await writeFile(skillPath, content, "utf8");
  return skillPath;
}

async function expectSopSkillStoreError(
  promise: Promise<unknown>,
  expectedCode: SopSkillStoreError["code"]
): Promise<SopSkillStoreError> {
  try {
    await promise;
    assert.fail(`expected SopSkillStoreError with code ${expectedCode}`);
  } catch (error) {
    assert.ok(error instanceof SopSkillStoreError);
    assert.equal(error.code, expectedCode);
    return error;
  }
}

test("sop skill store lists metadata in deterministic name order", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "sasiki-skill-store-"));
  await createSkillFile(
    rootDir,
    "zeta-skill",
    [
      "---",
      "name: zeta-skill",
      "description: Last skill.",
      "---",
      "",
      "# Zeta",
    ].join("\n")
  );
  await createSkillFile(
    rootDir,
    "alpha-skill",
    [
      "---",
      "name: alpha-skill",
      "description: First skill.",
      "---",
      "",
      "# Alpha",
    ].join("\n")
  );

  const store = new SopSkillStore(rootDir);

  const metadata = await store.listMetadata();

  assert.deepEqual(metadata, [
    {
      name: "alpha-skill",
      description: "First skill.",
    },
    {
      name: "zeta-skill",
      description: "Last skill.",
    },
  ]);
});

test("sop skill store reads quoted yaml frontmatter scalars and preserves markdown text", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "sasiki-skill-store-"));
  const body = [
    "# Skill Title",
    "",
    "## Goal",
    "",
    "- keep exact markdown body text",
    "- including blank lines",
  ].join("\n");
  await createSkillFile(
    rootDir,
    "tiktok-customer-service",
    [
      "---",
      'name: "tiktok-customer-service"',
      "description: 'Check whether new customer chats need handling.'",
      "---",
      "",
      body,
    ].join("\n")
  );

  const store = new SopSkillStore(rootDir);

  const skill = await store.readSkill("tiktok-customer-service");

  assert.equal(skill.name, "tiktok-customer-service");
  assert.equal(skill.description, "Check whether new customer chats need handling.");
  assert.equal(skill.body, body);
  assert.equal(skill.path, path.join(rootDir, "tiktok-customer-service", "SKILL.md"));
});

test("sop skill store writes a canonical SKILL.md document and returns its path", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "sasiki-skill-store-"));
  const store = new SopSkillStore(rootDir);

  const result = await store.writeSkill({
    name: "homepage-capture",
    description: "Capture the homepage for a known site.",
    body: [
      "# Homepage Capture",
      "",
      "## Goal",
      "",
      "Open the target homepage and stop when the page is visible.",
    ].join("\n"),
    sourceObserveRunId: "run-123",
  });

  assert.equal(result.skillPath, path.join(rootDir, "homepage-capture", "SKILL.md"));
  assert.equal(
    await readFile(result.skillPath, "utf8"),
    [
      "---",
      "name: homepage-capture",
      'description: "Capture the homepage for a known site."',
      "source_observe_run_id: run-123",
      "---",
      "",
      "# Homepage Capture",
      "",
      "## Goal",
      "",
      "Open the target homepage and stop when the page is visible.",
      "",
    ].join("\n")
  );
});

test("sop skill store round-trips escaped quoted scalar content through write and read", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "sasiki-skill-store-"));
  const store = new SopSkillStore(rootDir);
  const description = 'Handle "quoted" values from C:\\Temp\\demo without losing backslashes.';

  await store.writeSkill({
    name: "escaped-skill",
    description,
    body: "# Escaped Skill",
    sourceObserveRunId: "run-123",
  });

  const skill = await store.readSkill("escaped-skill");
  const metadata = await store.listMetadata();

  assert.equal(skill.description, description);
  assert.deepEqual(metadata, [
    {
      name: "escaped-skill",
      description,
    },
  ]);
});

test("sop skill store rejects invalid skill documents with an explicit error code", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "sasiki-skill-store-"));
  const store = new SopSkillStore(rootDir);

  await expectSopSkillStoreError(
    store.writeSkill({
      name: "homepage-capture",
      description: "",
      body: "# Homepage Capture",
      sourceObserveRunId: "run-123",
    }),
    "SOP_SKILL_INVALID_DOCUMENT"
  );
});

test("sop skill store rejects empty markdown bodies when reading a skill", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "sasiki-skill-store-"));
  await createSkillFile(
    rootDir,
    "empty-body",
    [
      "---",
      "name: empty-body",
      "description: Empty body should fail.",
      "---",
      "",
    ].join("\n")
  );

  const store = new SopSkillStore(rootDir);

  await expectSopSkillStoreError(store.readSkill("empty-body"), "SOP_SKILL_INVALID_DOCUMENT");
});

test("sop skill store rejects invalid skill references with an explicit error code", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "sasiki-skill-store-"));
  const store = new SopSkillStore(rootDir);

  await expectSopSkillStoreError(store.readSkill("../missing-skill"), "SOP_SKILL_INVALID_REFERENCE");
});

test("sop skill store rejects non-slug skill names with an explicit error code", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "sasiki-skill-store-"));
  const store = new SopSkillStore(rootDir);

  await expectSopSkillStoreError(
    store.writeSkill({
      name: "Homepage Capture",
      description: "Bad name shape.",
      body: "# Homepage Capture",
      sourceObserveRunId: "run-123",
    }),
    "SOP_SKILL_INVALID_REFERENCE"
  );
});

test("sop skill store rejects missing named skills with an explicit error code", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "sasiki-skill-store-"));
  const store = new SopSkillStore(rootDir);

  await expectSopSkillStoreError(store.readSkill("missing-skill"), "SOP_SKILL_NOT_FOUND");
});

test("sop skill store fails explicitly when a discovered skill directory is missing SKILL.md", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "sasiki-skill-store-"));
  await mkdir(path.join(rootDir, "missing-document"), { recursive: true });

  const store = new SopSkillStore(rootDir);

  const error = await expectSopSkillStoreError(store.listMetadata(), "SOP_SKILL_NOT_FOUND");
  assert.equal(error.detail?.name, "missing-document");
});

test("sop skill store rejects mismatched directory and frontmatter names when reading a skill", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "sasiki-skill-store-"));
  await createSkillFile(
    rootDir,
    "directory-name",
    [
      "---",
      "name: frontmatter-name",
      "description: Skill content.",
      "---",
      "",
      "# Mismatch",
    ].join("\n")
  );

  const store = new SopSkillStore(rootDir);

  await expectSopSkillStoreError(store.readSkill("directory-name"), "SOP_SKILL_NAME_MISMATCH");
});

test("sop skill store rejects mismatched directory and frontmatter names during listing", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "sasiki-skill-store-"));
  await createSkillFile(
    rootDir,
    "directory-name",
    [
      "---",
      "name: frontmatter-name",
      "description: Skill content.",
      "---",
      "",
      "# Mismatch",
    ].join("\n")
  );

  const store = new SopSkillStore(rootDir);

  await expectSopSkillStoreError(store.listMetadata(), "SOP_SKILL_NAME_MISMATCH");
});

test("sop skill store fails explicitly for invalid frontmatter", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "sasiki-skill-store-"));
  await createSkillFile(
    rootDir,
    "broken-skill",
    [
      "---",
      "name: broken-skill",
      "---",
      "",
      "# Broken",
    ].join("\n")
  );

  const store = new SopSkillStore(rootDir);

  await expectSopSkillStoreError(store.readSkill("broken-skill"), "SOP_SKILL_INVALID_FRONTMATTER");
});

test("sop skill store fails explicitly for broken frontmatter during listing", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "sasiki-skill-store-"));
  await createSkillFile(
    rootDir,
    "broken-skill",
    [
      "---",
      "name: broken-skill",
      "---",
      "",
      "# Broken",
    ].join("\n")
  );

  const store = new SopSkillStore(rootDir);

  await expectSopSkillStoreError(store.listMetadata(), "SOP_SKILL_INVALID_FRONTMATTER");
});
