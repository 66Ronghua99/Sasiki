import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { createRuntimeLoadedSkillStore } from "../../../main/skills/runtime-skill-store";

describe("runtime loaded skill store", () => {
  test("loads the canonical runtime skill store module and delegates listMetadata", async () => {
    const loadCalls: Array<{ rootDir?: string }> = [];
    const store = createRuntimeLoadedSkillStore({
      rootDir: "/Users/cory/.sasiki/skills",
      loadCanonicalSkillStoreModule: async () => ({
        SopSkillStore: class {
          constructor(rootDir?: string) {
            loadCalls.push({ rootDir });
          }

          async listMetadata() {
            return [{ name: "canonical-skill", description: "canonical description" }];
          }
        },
      }),
    });

    const metadata = await store.listMetadata();

    assert.deepEqual(loadCalls, [{ rootDir: "/Users/cory/.sasiki/skills" }]);
    assert.deepEqual(metadata, [{ name: "canonical-skill", description: "canonical description" }]);
  });
});
