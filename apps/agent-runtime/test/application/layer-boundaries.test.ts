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
  const observeExecutorSource = await readSource("application/observe/observe-executor.ts");
  const runtimeCompositionRootSource = await readSource("application/shell/runtime-composition-root.ts");
  const compactSource = await readSource("application/compact/interactive-sop-compact.ts");

  assert.match(executionContextSource, /from "\.\.\/refine\/attention-guidance-loader\.js"/);
  assert.doesNotMatch(executionContextSource, /runtime\/replay-refinement\/attention-guidance-loader\.js/);

  assert.match(promptProviderSource, /from "\.\/system-prompts\.js"/);
  assert.doesNotMatch(promptProviderSource, /runtime\/system-prompts\.js/);

  assert.match(compactSource, /from "\.\.\/\.\.\/infrastructure\/persistence\/artifacts-writer\.js"/);
  assert.match(compactSource, /from "\.\.\/config\/runtime-config\.js"/);
  assert.doesNotMatch(compactSource, /runtime\/artifacts-writer\.js/);
  assert.doesNotMatch(compactSource, /runtime\/runtime-config\.js/);

  assert.match(observeExecutorSource, /from "\.\/support\/sop-demonstration-recorder\.js"/);
  assert.doesNotMatch(observeExecutorSource, /runtime\/observe-support\/sop-demonstration-recorder\.js/);

  assert.match(runtimeCompositionRootSource, /from "\.\.\/observe\/support\/sop-demonstration-recorder\.js"/);
  assert.doesNotMatch(runtimeCompositionRootSource, /runtime\/observe-support\/sop-demonstration-recorder\.js/);
});

test("compatibility source shells have been removed from core and runtime", () => {
  const removedPaths = [
    "core/agent-loop.ts",
    "core/json-model-client.ts",
    "core/mcp-tool-bridge.ts",
    "core/model-resolver.ts",
    "core/sop-demonstration-recorder.ts",
    "core/sop-trace-builder.ts",
    "core/sop-trace-guide-builder.ts",
    "runtime/artifacts-writer.ts",
    "runtime/command-router.ts",
    "runtime/compact-session-machine.ts",
    "runtime/compact-turn-normalizer.ts",
    "runtime/interactive-sop-compact-prompts.ts",
    "runtime/interactive-sop-compact.ts",
    "runtime/observe-executor.ts",
    "runtime/observe-runtime.ts",
    "runtime/observe-support/sop-demonstration-recorder.ts",
    "runtime/observe-support/sop-trace-builder.ts",
    "runtime/observe-support/sop-trace-guide-builder.ts",
    "runtime/providers/execution-context-provider.ts",
    "runtime/providers/prompt-provider.ts",
    "runtime/providers/refine-run-bootstrap-provider.ts",
    "runtime/providers/tool-surface-provider.ts",
    "runtime/replay-refinement/attention-guidance-loader.ts",
    "runtime/replay-refinement/attention-knowledge-store.ts",
    "runtime/replay-refinement/react-refinement-run-executor.ts",
    "runtime/replay-refinement/refine-browser-snapshot-parser.ts",
    "runtime/replay-refinement/refine-browser-tools.ts",
    "runtime/replay-refinement/refine-hitl-resume-store.ts",
    "runtime/replay-refinement/refine-react-session.ts",
    "runtime/replay-refinement/refine-react-tool-client.ts",
    "runtime/replay-refinement/refine-runtime-tools.ts",
    "runtime/runtime-composition-root.ts",
    "runtime/runtime-config.ts",
    "runtime/sop-asset-store.ts",
    "runtime/sop-rule-compact-builder.ts",
    "runtime/system-prompts.ts",
    "runtime/workflow-runtime.ts",
  ];

  for (const relPath of removedPaths) {
    assert.equal(existsSync(path.join(srcRoot, relPath)), false, `${relPath} should be removed`);
  }
});
