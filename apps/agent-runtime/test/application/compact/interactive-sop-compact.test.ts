import assert from "node:assert/strict";
import test from "node:test";

import {
  FINALIZE_SYSTEM_PROMPT,
  REASONER_SYSTEM_PROMPT,
  SUMMARIZE_SYSTEM_PROMPT,
} from "../../../src/application/compact/interactive-sop-compact-prompts.js";
import { createCompactWorkflow } from "../../../src/application/compact/compact-workflow.js";
import { InteractiveSopCompactService } from "../../../src/application/compact/interactive-sop-compact.js";
import { SopRuleCompactBuilder } from "../../../src/application/compact/sop-rule-compact-builder.js";
import { RuntimeHost } from "../../../src/application/shell/runtime-host.js";

test("application compact service and prompts are the canonical home", () => {
  assert.equal(typeof InteractiveSopCompactService, "function");
  assert.equal(typeof SopRuleCompactBuilder, "function");
  assert.match(REASONER_SYSTEM_PROMPT, /SOP compact reasoning agent/i);
  assert.match(SUMMARIZE_SYSTEM_PROMPT, /machine-readable state update/i);
  assert.match(FINALIZE_SYSTEM_PROMPT, /finalizing a reusable SOP compact capability/i);
});

test("compact workflow adapts the host contract without changing compact semantics", async () => {
  const calls: string[] = [];
  const service = {
    async compact(runId: string) {
      calls.push(`compact:${runId}`);
      return {
        schemaVersion: "compact_capability_output.v0",
        runId,
        taskUnderstanding: "understood",
        workflowSkeleton: ["step one"],
        decisionStrategy: ["ask once"],
        actionPolicy: {
          requiredActions: ["record"],
          optionalActions: [],
          conditionalActions: [],
          nonCoreActions: [],
        },
        stopPolicy: ["stop when done"],
        reuseBoundary: {
          applicableWhen: ["clear scope"],
          notApplicableWhen: ["browser state needed"],
          contextDependencies: ["trace artifacts"],
        },
        remainingUncertainties: [],
      };
    },
  };

  const workflow = createCompactWorkflow({ service, runId: "run-123" });
  assert.equal(await workflow.requestInterrupt("SIGINT"), false);

  const host = new RuntimeHost({ workflow });
  await host.start();
  const result = await host.execute();
  await host.dispose();

  assert.deepEqual(calls, ["compact:run-123"]);
  assert.deepEqual(result, {
    schemaVersion: "compact_capability_output.v0",
    runId: "run-123",
    taskUnderstanding: "understood",
    workflowSkeleton: ["step one"],
    decisionStrategy: ["ask once"],
    actionPolicy: {
      requiredActions: ["record"],
      optionalActions: [],
      conditionalActions: [],
      nonCoreActions: [],
    },
    stopPolicy: ["stop when done"],
    reuseBoundary: {
      applicableWhen: ["clear scope"],
      notApplicableWhen: ["browser state needed"],
      contextDependencies: ["trace artifacts"],
    },
    remainingUncertainties: [],
  });
});
