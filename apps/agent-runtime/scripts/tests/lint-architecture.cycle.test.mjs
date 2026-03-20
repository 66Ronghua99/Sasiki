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

test("reports dep.import.cycle when local TS imports form a cycle", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-arch-cycle-"));
  const srcRoot = path.join(tmpDir, "src");

  writeFile(
    path.join(srcRoot, "core", "a.ts"),
    'import { b } from "./b.js";\nexport const a = b;\n',
  );
  writeFile(
    path.join(srcRoot, "core", "b.ts"),
    'import { a } from "./a.js";\nexport const b = a;\n',
  );

  const result = analyzeArchitecture({ srcRoot });
  const cycleError = result.errors.find((item) => item.ruleId === "dep.import.cycle");

  assert.ok(cycleError, "expected dep.import.cycle error to exist");
});
