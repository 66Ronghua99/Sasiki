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
  const promptProviderSource = await readSource("application/refine/prompt-provider.ts");
  const refineWorkflowSource = await readSource("application/refine/refine-workflow.ts");
  const refineBootstrapSource = await readSource("application/refine/refine-run-bootstrap-provider.ts");
  const observeExecutorSource = await readSource("application/observe/observe-executor.ts");
  const runtimeCompositionRootSource = await readSource("application/shell/runtime-composition-root.ts");
  const workflowRuntimeSource = await readSource("application/shell/workflow-runtime.ts");
  const runtimeHostSource = await readSource("application/shell/runtime-host.ts");
  const compactWorkflowSource = await readSource("application/compact/compact-workflow.ts");
  const compactSource = await readSource("application/compact/interactive-sop-compact.ts");

  assert.match(promptProviderSource, /from "\.\/system-prompts\.js"/);
  assert.doesNotMatch(promptProviderSource, /runtime\/system-prompts\.js/);

  assert.match(refineWorkflowSource, /from "\.\/refine-react-tool-client\.js"/);
  assert.match(refineWorkflowSource, /from "\.\/refine-run-bootstrap-provider\.js"/);
  assert.doesNotMatch(refineWorkflowSource, /runtime\/agent-execution-runtime\.js/);
  assert.doesNotMatch(refineWorkflowSource, /application\/providers\//);

  assert.match(refineBootstrapSource, /from "\.\.\/\.\.\/infrastructure\/persistence\/attention-knowledge-store\.js"/);
  assert.match(refineBootstrapSource, /from "\.\/attention-guidance-loader\.js"/);
  assert.doesNotMatch(refineBootstrapSource, /application\/providers\//);
  assert.doesNotMatch(refineBootstrapSource, /runtime\/replay-refinement\/attention-guidance-loader\.js/);

  assert.match(compactSource, /from "\.\.\/\.\.\/infrastructure\/persistence\/artifacts-writer\.js"/);
  assert.match(compactSource, /from "\.\.\/config\/runtime-config\.js"/);
  assert.doesNotMatch(compactSource, /runtime\/artifacts-writer\.js/);
  assert.doesNotMatch(compactSource, /runtime\/runtime-config\.js/);

  assert.match(observeExecutorSource, /from "\.\/support\/sop-demonstration-recorder\.js"/);
  assert.doesNotMatch(observeExecutorSource, /runtime\/observe-support\/sop-demonstration-recorder\.js/);

  assert.match(runtimeCompositionRootSource, /from "\.\.\/observe\/observe-workflow-factory\.js"/);
  assert.match(runtimeCompositionRootSource, /from "\.\.\/compact\/interactive-sop-compact\.js"/);
  assert.match(runtimeCompositionRootSource, /from "\.\.\/refine\/refine-workflow\.js"/);
  assert.doesNotMatch(runtimeCompositionRootSource, /from "\.\.\/observe\/observe-executor\.js"/);
  assert.doesNotMatch(runtimeCompositionRootSource, /from "\.\.\/observe\/support\/sop-demonstration-recorder\.js"/);
  assert.doesNotMatch(runtimeCompositionRootSource, /from "\.\.\/\.\.\/infrastructure\/browser\/playwright-demonstration-recorder\.js"/);
  assert.doesNotMatch(runtimeCompositionRootSource, /application\/providers\//);
  assert.doesNotMatch(runtimeCompositionRootSource, /runtime\/observe-support\/sop-demonstration-recorder\.js/);

  assert.doesNotMatch(workflowRuntimeSource, /InteractiveSopCompactService/);
  assert.doesNotMatch(workflowRuntimeSource, /runtime\/agent-execution-runtime\.js/);

  assert.doesNotMatch(runtimeHostSource, /constructor\(options/);
  assert.doesNotMatch(runtimeHostSource, /async start\(\)/);
  assert.doesNotMatch(runtimeHostSource, /async execute\(\)/);

  assert.doesNotMatch(compactWorkflowSource, /createCompactWorkflowFactory/);
  assert.doesNotMatch(refineWorkflowSource, /createRefineWorkflowFactory/);
  assert.equal(existsSync(path.join(srcRoot, "application/observe/observe-runtime.ts")), false);
});

test("shell remains the phase 1 singleton owner for lifecycle and front-door handoff", async () => {
  const runtimeCompositionRootSource = await readSource("application/shell/runtime-composition-root.ts");
  const workflowRuntimeSource = await readSource("application/shell/workflow-runtime.ts");
  const runtimeHostSource = await readSource("application/shell/runtime-host.ts");

  assert.match(runtimeHostSource, /import type \{ HostedWorkflow \} from "\.\/workflow-contract\.js";/);
  assert.match(runtimeHostSource, /private activeWorkflow: HostedWorkflow<unknown> \| null = null;/);
  assert.match(runtimeHostSource, /throw new Error\("runtime host already owns an active workflow"\);/);
  assert.match(runtimeHostSource, /await this\.startActiveWorkflow\(\);/);
  assert.match(runtimeHostSource, /return await workflow\.execute\(\);/);
  assert.match(runtimeHostSource, /await this\.disposeActiveWorkflow\(workflow\);/);
  assert.doesNotMatch(runtimeHostSource, /\.\.\/observe\//);
  assert.doesNotMatch(runtimeHostSource, /\.\.\/refine\//);
  assert.doesNotMatch(runtimeHostSource, /\.\.\/compact\//);
  assert.doesNotMatch(runtimeHostSource, /\.\.\/\.\.\/infrastructure\//);

  assert.match(workflowRuntimeSource, /from "\.\/runtime-composition-root\.js"/);
  assert.match(workflowRuntimeSource, /from "\.\/runtime-host\.js"/);
  assert.match(workflowRuntimeSource, /const factory = registry\.resolve\(request\.command\);/);
  assert.match(workflowRuntimeSource, /return this\.runtimeHost\.run\(workflowFactory\(\)\);/);
  assert.doesNotMatch(workflowRuntimeSource, /new InteractiveSopCompactService/);
  assert.doesNotMatch(workflowRuntimeSource, /new CdpBrowserLauncher/);
  assert.doesNotMatch(workflowRuntimeSource, /new McpStdioClient/);
  assert.doesNotMatch(workflowRuntimeSource, /workflow\.prepare\(\)/);
  assert.doesNotMatch(workflowRuntimeSource, /workflow\.execute\(\)/);
  assert.doesNotMatch(workflowRuntimeSource, /workflow\.dispose\(\)/);

  assert.match(runtimeCompositionRootSource, /new RuntimeLogger\(\)/);
  assert.match(runtimeCompositionRootSource, /new CdpBrowserLauncher\(/);
  assert.match(runtimeCompositionRootSource, /new McpStdioClient\(/);
  assert.match(runtimeCompositionRootSource, /createObserveWorkflowFactory\(/);
  assert.match(runtimeCompositionRootSource, /createRefineWorkflowAssembly\(/);
  assert.match(runtimeCompositionRootSource, /new InteractiveSopCompactService\(/);
  assert.doesNotMatch(runtimeCompositionRootSource, /new RuntimeHost\(/);
});

test("workflow modules stay isolated while named phase 1 transition seams remain explicit", async () => {
  const observeWorkflowSource = await readSource("application/observe/observe-workflow.ts");
  const observeWorkflowFactorySource = await readSource("application/observe/observe-workflow-factory.ts");
  const observeExecutorSource = await readSource("application/observe/observe-executor.ts");
  const compactWorkflowSource = await readSource("application/compact/compact-workflow.ts");
  const compactSource = await readSource("application/compact/interactive-sop-compact.ts");
  const refineWorkflowSource = await readSource("application/refine/refine-workflow.ts");
  const refineBootstrapSource = await readSource("application/refine/refine-run-bootstrap-provider.ts");
  const reactRefinementRunExecutorSource = await readSource("application/refine/react-refinement-run-executor.ts");
  const runtimeConfigLoaderSource = await readSource("application/config/runtime-config-loader.ts");

  assert.match(observeWorkflowSource, /from "\.\.\/shell\/workflow-contract\.js"/);
  assert.doesNotMatch(observeWorkflowSource, /\.\.\/refine\//);
  assert.doesNotMatch(observeWorkflowSource, /\.\.\/compact\//);
  assert.doesNotMatch(observeWorkflowSource, /\.\.\/\.\.\/infrastructure\//);

  assert.match(refineWorkflowSource, /from "\.\.\/shell\/workflow-contract\.js"/);
  assert.doesNotMatch(refineWorkflowSource, /\.\.\/observe\//);
  assert.doesNotMatch(refineWorkflowSource, /\.\.\/compact\//);
  assert.doesNotMatch(refineWorkflowSource, /\.\.\/\.\.\/infrastructure\//);

  assert.match(compactWorkflowSource, /from "\.\.\/shell\/workflow-contract\.js"/);
  assert.doesNotMatch(compactWorkflowSource, /\.\.\/observe\//);
  assert.doesNotMatch(compactWorkflowSource, /\.\.\/refine\//);
  assert.doesNotMatch(compactWorkflowSource, /\.\.\/\.\.\/infrastructure\//);

  assert.match(observeWorkflowFactorySource, /from "\.\.\/\.\.\/infrastructure\/browser\/playwright-demonstration-recorder\.js"/);
  assert.match(observeExecutorSource, /from "\.\.\/\.\.\/infrastructure\/persistence\/artifacts-writer\.js"/);
  assert.match(observeExecutorSource, /from "\.\.\/\.\.\/infrastructure\/persistence\/sop-asset-store\.js"/);

  assert.match(compactSource, /from "\.\.\/\.\.\/infrastructure\/llm\/json-model-client\.js"/);
  assert.match(compactSource, /from "\.\.\/\.\.\/infrastructure\/hitl\/terminal-compact-human-loop-tool\.js"/);
  assert.match(compactSource, /from "\.\.\/\.\.\/infrastructure\/persistence\/artifacts-writer\.js"/);

  assert.match(refineBootstrapSource, /from "\.\.\/\.\.\/infrastructure\/persistence\/attention-knowledge-store\.js"/);
  assert.match(refineBootstrapSource, /from "\.\.\/\.\.\/infrastructure\/persistence\/refine-hitl-resume-store\.js"/);
  assert.match(reactRefinementRunExecutorSource, /from "\.\.\/\.\.\/infrastructure\/persistence\/artifacts-writer\.js"/);
  assert.match(runtimeConfigLoaderSource, /from "\.\.\/\.\.\/infrastructure\/config\/runtime-bootstrap-provider\.js"/);
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
    "runtime/agent-execution-runtime.ts",
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
