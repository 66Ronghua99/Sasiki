import assert from "node:assert/strict";
import test from "node:test";

import { ModelResolver } from "../../src/infrastructure/llm/model-resolver.js";

test("ModelResolver uses native openrouter provider when baseUrl points to OpenRouter", () => {
  const model = ModelResolver.resolve({
    model: "minimax/minimax-m2.1",
    baseUrl: "https://openrouter.ai/api/v1",
  });

  assert.equal(model.provider, "openrouter");
  assert.equal(model.id, "minimax/minimax-m2.1");
  assert.equal(model.api, "openai-completions");
  assert.equal(model.baseUrl, "https://openrouter.ai/api/v1");
});
