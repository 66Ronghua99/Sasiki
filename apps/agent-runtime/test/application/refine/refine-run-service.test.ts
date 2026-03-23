import assert from "node:assert/strict";
import test from "node:test";

import { createRefineReactSession } from "../../../src/application/refine/refine-react-session.js";
import {
  createRefineToolContextRef,
} from "../../../src/application/refine/tools/refine-tool-context.js";
import {
  RefineRunServiceImpl,
  type HitlAnswerProvider,
  type RefineRunServiceContext,
} from "../../../src/application/refine/tools/services/refine-run-service.js";

test("run service rebinds the latest session before HITL pause state", async () => {
  const contextRef = createRefineToolContextRef<RefineRunServiceContext>({});
  const service = new RefineRunServiceImpl({
    session: createRefineReactSession("run-1", "task-1", { taskScope: "scope-1" }),
  });

  const first = await service.requestHumanInput({
    prompt: "Need help",
    context: "first pass",
  });
  service.setSession(createRefineReactSession("run-2", "task-2", { taskScope: "scope-2" }));
  const second = await service.requestHumanInput({
    prompt: "Need help",
    context: "second pass",
  });

  assert.deepEqual(first, {
    status: "paused",
    resumeRunId: "run-1",
    resumeToken: first.status === "paused" ? first.resumeToken : "",
  });
  assert.deepEqual(second, {
    status: "paused",
    resumeRunId: "run-2",
    resumeToken: second.status === "paused" ? second.resumeToken : "",
  });
  assert.equal(service.getSession().runId, "run-2");
  assert.deepEqual(contextRef.get(), {});
});

test("run service rebinds the latest HITL provider before answered requests", async () => {
  const provider1: HitlAnswerProvider = async () => "answer-1";
  const provider2: HitlAnswerProvider = async () => "answer-2";
  const contextRef = createRefineToolContextRef<RefineRunServiceContext>({});
  const service = new RefineRunServiceImpl({
    session: createRefineReactSession("run-provider", "task", { taskScope: "scope" }),
    hitlAnswerProvider: provider1,
  });

  const first = await service.requestHumanInput({
    prompt: "Need confirmation",
  });
  service.setHitlAnswerProvider(provider2);
  const second = await service.requestHumanInput({
    prompt: "Need confirmation",
  });

  assert.deepEqual(first, {
    status: "answered",
    answer: "answer-1",
  });
  assert.deepEqual(second, {
    status: "answered",
    answer: "answer-2",
  });
  assert.deepEqual(contextRef.get(), {});
});
