import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const srcRoot = path.join(projectRoot, "src");

async function readSource(relPath: string): Promise<string> {
  return readFile(path.join(srcRoot, relPath), "utf-8");
}

test("application boundaries use canonical application and infrastructure modules", async () => {
  const executionContextSource = await readSource("application/providers/execution-context-provider.ts");
  const promptProviderSource = await readSource("application/refine/prompt-provider.ts");
  const compactSource = await readSource("application/compact/interactive-sop-compact.ts");
  const runtimePromptsSource = await readSource("runtime/system-prompts.ts");

  assert.match(executionContextSource, /from "\.\.\/refine\/attention-guidance-loader\.js"/);
  assert.doesNotMatch(executionContextSource, /runtime\/replay-refinement\/attention-guidance-loader\.js/);

  assert.match(promptProviderSource, /from "\.\/system-prompts\.js"/);
  assert.doesNotMatch(promptProviderSource, /runtime\/system-prompts\.js/);

  assert.match(compactSource, /from "\.\.\/\.\.\/infrastructure\/persistence\/artifacts-writer\.js"/);
  assert.match(compactSource, /from "\.\.\/config\/runtime-config\.js"/);
  assert.doesNotMatch(compactSource, /runtime\/artifacts-writer\.js/);
  assert.doesNotMatch(compactSource, /runtime\/runtime-config\.js/);

  assert.match(runtimePromptsSource, /export \* from "\.\.\/application\/refine\/system-prompts\.js";/);
});

test("runtime agent-runtime shim has been removed", () => {
  assert.equal(existsSync(path.join(srcRoot, "runtime/agent-runtime.ts")), false);
});
