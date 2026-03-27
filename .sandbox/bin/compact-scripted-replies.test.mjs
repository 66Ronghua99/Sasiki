import test from "node:test";
import assert from "node:assert/strict";

import { resolveCompactScriptedReplies } from "./compact-scripted-replies.mjs";

test("resolveCompactScriptedReplies prefers explicit replies", () => {
  assert.equal(
    resolveCompactScriptedReplies({
      explicitReplies: '["manual answer"]',
      autoObserve: true,
      observePreset: "tiktok-shop-customer-service",
    }),
    '["manual answer"]'
  );
});

test("resolveCompactScriptedReplies provides default replies for the TikTok preset", () => {
  const result = resolveCompactScriptedReplies({
    autoObserve: true,
    observePreset: "tiktok-shop-customer-service",
  });

  assert.ok(result);
  const replies = JSON.parse(result);
  assert.equal(Array.isArray(replies), true);
  assert.equal(replies.length, 6);
  assert.equal(
    replies[0],
    "复用这条流程时，必须先进入客服消息页，再检查已分配、未分配和未读相关视图。不能只停留在主页，也不能只根据导航角标判断是否有消息。"
  );
  assert.equal(
    replies[2],
    "在消息页内部，已分配和未分配是会话列表上方的 tabs，未读是状态筛选区里的“未读”选项。"
  );
  assert.equal(
    replies[5],
    "当前不用补充新示教，先按这些固定入口、判断标准和停止条件产出可复用 skill。"
  );
});

test("resolveCompactScriptedReplies returns undefined when automation preset support is absent", () => {
  assert.equal(
    resolveCompactScriptedReplies({
      autoObserve: false,
      observePreset: "tiktok-shop-customer-service",
    }),
    undefined
  );
  assert.equal(
    resolveCompactScriptedReplies({
      autoObserve: true,
      observePreset: "unknown-preset",
    }),
    undefined
  );
});
