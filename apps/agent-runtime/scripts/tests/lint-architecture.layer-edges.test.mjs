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

test("reports dep.application.workflow.horizontal for workflow-to-workflow imports", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-arch-workflow-edge-"));
  const srcRoot = path.join(tmpDir, "src");

  writeFile(
    path.join(srcRoot, "application", "observe", "foo.ts"),
    'import { refine } from "../refine/bar.js";\nexport const observe = refine;\n',
  );
  writeFile(
    path.join(srcRoot, "application", "refine", "bar.ts"),
    'export const refine = "refine";\n',
  );

  const result = analyzeArchitecture({ srcRoot });

  assert.deepEqual(
    result.errors.filter((item) => item.ruleId === "dep.application.workflow.horizontal"),
    [
      {
        ruleId: "dep.application.workflow.horizontal",
        fileRel: "application/observe/foo.ts",
        message: "Workflow sublayer observe must not depend on sibling workflow sublayer refine (application/refine/bar.ts).",
      },
    ],
  );
});
