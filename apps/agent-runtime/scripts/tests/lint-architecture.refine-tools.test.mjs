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

test("reports dep.refine-tools.definitions.no-runtime for definitions importing runtime", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-arch-refine-tools-"));
  const srcRoot = path.join(tmpDir, "src");

  writeFile(
    path.join(srcRoot, "application", "refine", "tools", "definitions", "a.ts"),
    'import { runtimeTool } from "../runtime/b.js";\nexport const toolDefinition = runtimeTool;\n',
  );
  writeFile(
    path.join(srcRoot, "application", "refine", "tools", "runtime", "b.ts"),
    'export const runtimeTool = "runtime";\n',
  );

  const result = analyzeArchitecture({ srcRoot });

  assert.deepEqual(
    result.errors.filter((item) => item.ruleId === "dep.refine-tools.definitions.no-runtime"),
    [
      {
        ruleId: "dep.refine-tools.definitions.no-runtime",
        fileRel: "application/refine/tools/definitions/a.ts",
        message: "Refine tool definitions must not depend on refine tool runtime (application/refine/tools/runtime/b.ts).",
      },
    ],
  );
});
