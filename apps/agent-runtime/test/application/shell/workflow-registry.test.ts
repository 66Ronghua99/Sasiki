import assert from "node:assert/strict";
import test from "node:test";

import { createWorkflowRegistry } from "../../../src/application/shell/workflow-registry.js";

test("workflow registry resolves factories lazily by command", () => {
  let observeFactoryCalls = 0;
  let refineFactoryCalls = 0;
  let compactFactoryCalls = 0;

  const observeFactory = () => {
    observeFactoryCalls += 1;
    return { observe: true };
  };
  const refineFactory = () => {
    refineFactoryCalls += 1;
    return { refine: true };
  };
  const compactFactory = () => {
    compactFactoryCalls += 1;
    return { compact: true };
  };

  const registry = createWorkflowRegistry({
    observe: observeFactory,
    refine: refineFactory,
    "sop-compact": compactFactory,
  });

  assert.equal(observeFactoryCalls, 0);
  assert.equal(refineFactoryCalls, 0);
  assert.equal(compactFactoryCalls, 0);
  assert.equal(registry.resolve("observe"), observeFactory);
  assert.equal(registry.resolve("refine"), refineFactory);
  assert.equal(registry.resolve("sop-compact"), compactFactory);
  assert.equal(observeFactoryCalls, 0);
  assert.equal(refineFactoryCalls, 0);
  assert.equal(compactFactoryCalls, 0);
});
