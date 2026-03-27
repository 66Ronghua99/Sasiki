import assert from "node:assert/strict";
import test from "node:test";

import {
  parseScriptedCompactReplies,
  ScriptedCompactHumanLoopTool,
} from "../../src/infrastructure/hitl/scripted-compact-human-loop-tool.js";

test("parseScriptedCompactReplies accepts a plain-text fallback reply", () => {
  assert.deepEqual(parseScriptedCompactReplies("  check the inbox list, not just the badge  "), [
    "check the inbox list, not just the badge",
  ]);
});

test("parseScriptedCompactReplies accepts a JSON string array", () => {
  assert.deepEqual(
    parseScriptedCompactReplies('[" open inbox ", "if all counts are 0, record empty state", ""]'),
    ["open inbox", "if all counts are 0, record empty state"]
  );
});

test("parseScriptedCompactReplies rejects invalid JSON-like payloads", () => {
  assert.throws(
    () => parseScriptedCompactReplies('["unterminated"'),
    /invalid SASIKI_COMPACT_SCRIPTED_REPLIES payload/
  );
});

test("ScriptedCompactHumanLoopTool returns replies in order and fails explicitly when exhausted", async () => {
  const tool = new ScriptedCompactHumanLoopTool(["first answer", "second answer"]);

  const first = await tool.requestClarification({} as never);
  const second = await tool.requestClarification({} as never);

  assert.equal(first.human_reply, "first answer");
  assert.equal(first.interaction_status, "answered");
  assert.equal(second.human_reply, "second answer");
  assert.equal(second.interaction_status, "answered");

  await assert.rejects(
    () => tool.requestClarification({} as never),
    /scripted sop-compact replies exhausted/
  );
});
