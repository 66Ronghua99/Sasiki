import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { analyzeArchitecture } from "../lint-architecture.mjs";

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

test("reports root.top-level-allowlist for unknown top-level roots", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-arch-roots-"));
  const srcRoot = path.join(tmpDir, "src");

  writeFile(path.join(srcRoot, "shared", "stray.ts"), "export const stray = 1;\n");

  const result = analyzeArchitecture({ srcRoot });

  assert.deepEqual(
    result.errors.filter((item) => item.ruleId === "root.top-level-allowlist"),
    [
      {
        ruleId: "root.top-level-allowlist",
        fileRel: "shared/stray.ts",
        message: "Top-level root shared/ is not approved. Allowed roots: application, contracts, domain, infrastructure, kernel, utils.",
      },
    ],
  );
});

for (const rootName of ["runtime", "core"]) {
  test(`reports root.deprecated for deprecated top-level root ${rootName}/`, () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `lint-arch-${rootName}-`));
    const srcRoot = path.join(tmpDir, "src");

    writeFile(path.join(srcRoot, rootName, "new-file.ts"), "export const runtimeLeak = true;\n");

    const result = analyzeArchitecture({ srcRoot });

    assert.deepEqual(
      result.errors.filter((item) => item.ruleId === "root.deprecated"),
      [
        {
          ruleId: "root.deprecated",
          fileRel: `${rootName}/new-file.ts`,
          message: `Top-level root ${rootName}/ is banned in Phase 1. New src/${rootName}/* files are not allowed.`,
        },
      ],
    );
  });
}
