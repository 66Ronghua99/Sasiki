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

function normalizeWhitespace(source: string): string {
  return source.replace(/\s+/g, " ").trim();
}

function assertHasSnippet(source: string, snippet: string, message: string): void {
  assert.ok(normalizeWhitespace(source).includes(normalizeWhitespace(snippet)), message);
}

function assertLacksSnippet(source: string, snippet: string, message: string): void {
  assert.ok(!normalizeWhitespace(source).includes(normalizeWhitespace(snippet)), message);
}

test("application boundaries use canonical application and infrastructure modules", async () => {
  const promptProviderSource = await readSource("application/refine/prompt-provider.ts");
  const refineWorkflowSource = await readSource("application/refine/refine-workflow.ts");
  const refineBootstrapSource = await readSource("application/refine/refine-run-bootstrap-provider.ts");
  const observeExecutorSource = await readSource("application/observe/observe-executor.ts");
  const observeWorkflowFactorySource = await readSource("application/observe/observe-workflow-factory.ts");
  const runtimeCompositionRootSource = await readSource("application/shell/runtime-composition-root.ts");
  const workflowRuntimeSource = await readSource("application/shell/workflow-runtime.ts");
  const runtimeHostSource = await readSource("application/shell/runtime-host.ts");
  const compactWorkflowSource = await readSource("application/compact/compact-workflow.ts");
  const compactSource = await readSource("application/compact/interactive-sop-compact.ts");

  assert.match(promptProviderSource, /from "\.\/system-prompts\.js"/);
  assert.doesNotMatch(promptProviderSource, /runtime\/system-prompts\.js/);

  assert.match(refineWorkflowSource, /from "\.\/refine-react-tool-client\.js"/);
  assert.match(refineWorkflowSource, /from "\.\/refine-run-bootstrap-provider\.js"/);
  assert.match(refineWorkflowSource, /RefinePersistenceContext/);
  assert.doesNotMatch(refineWorkflowSource, /createRefinePersistenceContext/);
  assert.doesNotMatch(refineWorkflowSource, /runtime\/agent-execution-runtime\.js/);

  assert.match(refineBootstrapSource, /from "\.\/attention-guidance-loader\.js"/);
  assert.doesNotMatch(refineBootstrapSource, /new AttentionKnowledgeStore\(/);
  assert.doesNotMatch(refineBootstrapSource, /new AttentionGuidanceLoader\(/);
  assert.doesNotMatch(refineBootstrapSource, /new RefineHitlResumeStore\(/);
  assert.doesNotMatch(refineBootstrapSource, /runtime\/replay-refinement\/attention-guidance-loader\.js/);
  assert.doesNotMatch(refineBootstrapSource, /createRefinePersistenceContext\(/);

  assert.match(compactSource, /from "\.\.\/config\/runtime-config\.js"/);
  assert.doesNotMatch(compactSource, /from "\.\.\/\.\.\/infrastructure\/persistence\/artifacts-writer\.js"/);
  assert.doesNotMatch(compactSource, /runtime\/artifacts-writer\.js/);
  assert.doesNotMatch(compactSource, /runtime\/runtime-config\.js/);

  assert.match(observeExecutorSource, /from "\.\/support\/sop-demonstration-recorder\.js"/);
  assert.doesNotMatch(observeExecutorSource, /runtime\/observe-support\/sop-demonstration-recorder\.js/);
  assert.doesNotMatch(observeWorkflowFactorySource, /new PlaywrightDemonstrationRecorder\(/);

  assert.match(runtimeCompositionRootSource, /from "\.\.\/observe\/observe-workflow-factory\.js"/);
  assert.match(runtimeCompositionRootSource, /from "\.\.\/compact\/interactive-sop-compact\.js"/);
  assert.match(runtimeCompositionRootSource, /from "\.\.\/refine\/refine-workflow\.js"/);
  assert.match(runtimeCompositionRootSource, /from "\.\.\/refine\/attention-guidance-loader\.js"/);
  assert.match(runtimeCompositionRootSource, /from "\.\.\/\.\.\/infrastructure\/persistence\/attention-knowledge-store\.js"/);
  assert.match(runtimeCompositionRootSource, /from "\.\.\/\.\.\/infrastructure\/persistence\/refine-hitl-resume-store\.js"/);
  assert.match(runtimeCompositionRootSource, /from "\.\.\/\.\.\/infrastructure\/browser\/playwright-demonstration-recorder\.js"/);
  assert.match(runtimeCompositionRootSource, /from "\.\.\/\.\.\/infrastructure\/hitl\/terminal-compact-human-loop-tool\.js"/);
  assert.match(runtimeCompositionRootSource, /from "\.\.\/\.\.\/infrastructure\/llm\/json-model-client\.js"/);
  assert.match(runtimeCompositionRootSource, /from "\.\.\/\.\.\/infrastructure\/persistence\/artifacts-writer\.js"/);
  assert.match(runtimeCompositionRootSource, /from "\.\.\/\.\.\/infrastructure\/persistence\/sop-asset-store\.js"/);
  assert.match(runtimeCompositionRootSource, /new AttentionKnowledgeStore\(/);
  assert.match(runtimeCompositionRootSource, /new AttentionGuidanceLoader\(/);
  assert.match(runtimeCompositionRootSource, /new RefineHitlResumeStore\(/);
  assert.match(runtimeCompositionRootSource, /createArtifactsWriter:/);
  assert.match(runtimeCompositionRootSource, /createRefinePersistenceContext\(/);
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
  assert.match(runtimeCompositionRootSource, /new PlaywrightDemonstrationRecorder\(\)/);
  assert.match(runtimeCompositionRootSource, /new SopAssetStore\(/);
  assert.match(runtimeCompositionRootSource, /new ArtifactsWriter\(/);
  assert.match(runtimeCompositionRootSource, /new JsonModelClient\(/);
  assert.match(runtimeCompositionRootSource, /new TerminalCompactHumanLoopTool\(\)/);
  assert.match(runtimeCompositionRootSource, /const createObserveArtifactsWriter = \(runId: string\) => new ArtifactsWriter/);
  assert.match(runtimeCompositionRootSource, /const createCompactArtifactsWriter = \(runId: string\) => new ArtifactsWriter/);
  assert.match(runtimeCompositionRootSource, /const createRefineArtifactsWriter = \(runId: string\) => new ArtifactsWriter/);
  assert.match(runtimeCompositionRootSource, /createObserveWorkflowFactory\(/);
  assert.match(runtimeCompositionRootSource, /createRefineWorkflowAssembly\(/);
  assert.match(runtimeCompositionRootSource, /new InteractiveSopCompactService\(/);
  assert.doesNotMatch(runtimeCompositionRootSource, /new RuntimeHost\(/);
});

test("workflow modules stay isolated while shell owns the concrete observe and compact adapters", async () => {
  const observeWorkflowSource = await readSource("application/observe/observe-workflow.ts");
  const observeWorkflowFactorySource = await readSource("application/observe/observe-workflow-factory.ts");
  const observeExecutorSource = await readSource("application/observe/observe-executor.ts");
  const compactWorkflowSource = await readSource("application/compact/compact-workflow.ts");
  const compactSource = await readSource("application/compact/interactive-sop-compact.ts");
  const refineWorkflowSource = await readSource("application/refine/refine-workflow.ts");
  const refineBootstrapSource = await readSource("application/refine/refine-run-bootstrap-provider.ts");
  const reactRefinementRunExecutorSource = await readSource("application/refine/react-refinement-run-executor.ts");
  const runtimeConfigLoaderSource = await readSource("application/config/runtime-config-loader.ts");
  const runtimeConfigBootstrapSource = await readSource("application/shell/runtime-config-bootstrap.ts");
  const runtimeCompositionRootSource = await readSource("application/shell/runtime-composition-root.ts");
  const runtimeBootstrapProviderSource = await readSource("infrastructure/config/runtime-bootstrap-provider.ts");
  const attentionGuidanceLoaderSource = await readSource("application/refine/attention-guidance-loader.ts");
  const refineToolCompositionSource = await readSource("application/refine/tools/refine-tool-composition.ts");
  const refineReactToolClientSource = await readSource("application/refine/refine-react-tool-client.ts");
  const refineBrowserServiceSource = await readSource("application/refine/tools/services/refine-browser-service.ts");
  const refineRunServiceSource = await readSource("application/refine/tools/services/refine-run-service.ts");
  const refineRunBootstrapProviderSource = await readSource("application/refine/refine-run-bootstrap-provider.ts");
  const definitionSources = {
    "observe-page-tool.ts": await readSource("application/refine/tools/definitions/observe-page-tool.ts"),
    "observe-query-tool.ts": await readSource("application/refine/tools/definitions/observe-query-tool.ts"),
    "act-click-tool.ts": await readSource("application/refine/tools/definitions/act-click-tool.ts"),
    "act-file-upload-tool.ts": await readSource("application/refine/tools/definitions/act-file-upload-tool.ts"),
    "act-navigate-tool.ts": await readSource("application/refine/tools/definitions/act-navigate-tool.ts"),
    "act-press-tool.ts": await readSource("application/refine/tools/definitions/act-press-tool.ts"),
    "act-screenshot-tool.ts": await readSource("application/refine/tools/definitions/act-screenshot-tool.ts"),
    "act-select-tab-tool.ts": await readSource("application/refine/tools/definitions/act-select-tab-tool.ts"),
    "act-type-tool.ts": await readSource("application/refine/tools/definitions/act-type-tool.ts"),
    "hitl-request-tool.ts": await readSource("application/refine/tools/definitions/hitl-request-tool.ts"),
    "knowledge-record-candidate-tool.ts": await readSource("application/refine/tools/definitions/knowledge-record-candidate-tool.ts"),
    "run-finish-tool.ts": await readSource("application/refine/tools/definitions/run-finish-tool.ts"),
  } as const;

  assert.match(observeWorkflowSource, /from "\.\.\/shell\/workflow-contract\.js"/);
  assert.doesNotMatch(observeWorkflowSource, /\.\.\/refine\//);
  assert.doesNotMatch(observeWorkflowSource, /\.\.\/compact\//);
  assert.doesNotMatch(observeWorkflowSource, /\.\.\/\.\.\/infrastructure\//);

  assert.match(refineWorkflowSource, /from "\.\.\/shell\/workflow-contract\.js"/);
  assert.doesNotMatch(refineWorkflowSource, /\.\.\/observe\//);
  assert.doesNotMatch(refineWorkflowSource, /\.\.\/compact\//);
  assert.doesNotMatch(refineWorkflowSource, /\.\.\/\.\.\/infrastructure\//);
  assertHasSnippet(
    refineWorkflowSource,
    "const toolClient = new RefineReactToolClient(toolComposition);",
    "refine workflow should consume the composed tool-client contract"
  );

  assert.match(compactWorkflowSource, /from "\.\.\/shell\/workflow-contract\.js"/);
  assert.doesNotMatch(compactWorkflowSource, /\.\.\/observe\//);
  assert.doesNotMatch(compactWorkflowSource, /\.\.\/refine\//);
  assert.doesNotMatch(compactWorkflowSource, /\.\.\/\.\.\/infrastructure\//);

  assert.doesNotMatch(observeWorkflowFactorySource, /new PlaywrightDemonstrationRecorder\(/);
  assert.doesNotMatch(observeWorkflowFactorySource, /infrastructure\/logging\/runtime-logger\.js/);
  assert.doesNotMatch(observeExecutorSource, /new ArtifactsWriter\(/);
  assert.doesNotMatch(observeExecutorSource, /new SopAssetStore\(/);

  assert.doesNotMatch(compactSource, /new JsonModelClient\(/);
  assert.doesNotMatch(compactSource, /new TerminalCompactHumanLoopTool\(/);
  assert.doesNotMatch(compactSource, /new ArtifactsWriter\(/);

  assert.doesNotMatch(attentionGuidanceLoaderSource, /from "\.\.\/\.\.\/infrastructure\/persistence\/attention-knowledge-store\.js"/);
  assert.doesNotMatch(refineBootstrapSource, /from "\.\.\/\.\.\/infrastructure\/persistence\/attention-knowledge-store\.js"/);
  assert.doesNotMatch(refineBootstrapSource, /from "\.\.\/\.\.\/infrastructure\/persistence\/refine-hitl-resume-store\.js"/);
  assert.doesNotMatch(reactRefinementRunExecutorSource, /from "\.\.\/\.\.\/infrastructure\/persistence\/artifacts-writer\.js"/);
  assert.doesNotMatch(reactRefinementRunExecutorSource, /new ArtifactsWriter\(/);
  assert.doesNotMatch(refineReactToolClientSource, /from "\.\/tools\/providers\//);
  assert.doesNotMatch(refineReactToolClientSource, /from "\.\/tools\/runtime\//);
  assert.doesNotMatch(refineRunBootstrapProviderSource, /from "\.\/tools\/providers\//);
  assert.doesNotMatch(refineRunBootstrapProviderSource, /from "\.\/tools\/runtime\//);
  assert.doesNotMatch(runtimeConfigLoaderSource, /RuntimeBootstrapProvider/);
  assert.doesNotMatch(runtimeConfigLoaderSource, /new RuntimeBootstrapProvider\(/);
  assert.doesNotMatch(runtimeConfigLoaderSource, /loadRuntimeBootstrapSources/);
  assert.match(runtimeConfigLoaderSource, /fromBootstrapSources/);

  assert.match(runtimeConfigBootstrapSource, /from "\.\.\/config\/runtime-config-loader\.js"/);
  assert.match(runtimeConfigBootstrapSource, /from "\.\.\/\.\.\/infrastructure\/config\/runtime-bootstrap-provider\.js"/);
  assert.match(runtimeConfigBootstrapSource, /loadRuntimeConfig/);
  assert.match(runtimeCompositionRootSource, /createRefineArtifactsWriter/);

  assertHasSnippet(
    refineReactToolClientSource,
    `
    constructor(options: RefineReactToolClientOptions);
    constructor(options: RefineToolComposition);
    `,
    "refine react tool client should only advertise options and composition overloads"
  );
  assertLacksSnippet(
    refineReactToolClientSource,
    "constructor(options: RefineToolSurface<RefineToolCompositionContext>, contextRef: RefineToolContextRef<RefineToolCompositionContext>)",
    "refine react tool client should not expose the old surface/context rebinding constructor"
  );

  assert.doesNotMatch(runtimeBootstrapProviderSource, /type RuntimeConfig\b/);
  assert.doesNotMatch(runtimeBootstrapProviderSource, /DEFAULT_SOP_ASSET_ROOT_DIR/);

  assert.match(refineToolCompositionSource, /from "\.\/services\/refine-browser-service\.js"/);
  assert.match(refineToolCompositionSource, /from "\.\/services\/refine-run-service\.js"/);
  assert.doesNotMatch(refineToolCompositionSource, /from "\.\/runtime\/refine-browser-tools\.js"/);
  assert.doesNotMatch(refineToolCompositionSource, /from "\.\/runtime\/refine-runtime-tools\.js"/);
  assert.doesNotMatch(refineToolCompositionSource, /from "\.\/providers\/refine-browser-provider\.js"/);
  assert.doesNotMatch(refineToolCompositionSource, /from "\.\/providers\/refine-runtime-provider\.js"/);
  assertHasSnippet(
    refineToolCompositionSource,
    `
    export interface RefineToolCompositionContext extends RefineToolContext {
      browserService?: RefineBrowserService;
      runService?: RefineRunService;
    }
    `,
    "refine tool composition should expose service-owned context refs"
  );
  assert.match(refineToolCompositionSource, /browserService/);
  assert.match(refineToolCompositionSource, /runService/);
  assert.match(refineToolCompositionSource, /rawClient/);
  assert.doesNotMatch(refineToolCompositionSource, /contextRef\.set\(\{\s*\.\.\.contextRef\.get\(\),\s*session:/s);
  assertHasSnippet(
    refineToolCompositionSource,
    `
    contextRef.set({
      browserService,
      runService,
    });
    `,
    "refine tool composition should seed only service refs into the active context"
  );
  assert.doesNotMatch(refineToolCompositionSource, /\.\.\/\.\.\/\.\.\/infrastructure\//);
  assert.match(refineRunServiceSource, /export type HitlAnswerProvider =/);
  assert.match(refineBrowserServiceSource, /getSession\(\): RefineReactSession;/);
  assert.match(refineBrowserServiceSource, /setSession\(session: RefineReactSession\): void;/);
  assert.match(refineRunServiceSource, /getSession\(\): RefineReactSession;/);
  assert.match(refineRunServiceSource, /setSession\(session: RefineReactSession\): void;/);
  assert.match(refineRunServiceSource, /setHitlAnswerProvider\(provider\?: HitlAnswerProvider\): void;/);
  assert.doesNotMatch(refineBrowserServiceSource, /contextRef\.set\(\{\s*\.\.\.this\.contextRef\.get\(\),\s*session:/s);
  assert.doesNotMatch(refineRunServiceSource, /contextRef\.set\(\{\s*\.\.\.this\.contextRef\.get\(\),\s*session:/s);
  assert.doesNotMatch(refineRunServiceSource, /contextRef\.set\(\s*context\s*\)/s);
  assert.doesNotMatch(refineBrowserServiceSource, /from "\.\.\/runtime\/refine-browser-tools\.js"/);
  assert.doesNotMatch(refineRunServiceSource, /from "\.\.\/runtime\/refine-runtime-tools\.js"/);
  for (const [fileName, source] of Object.entries(definitionSources)) {
    assert.match(source, /browserService|runService/, `${fileName} should read service-owned context`);
    assert.doesNotMatch(source, /context\.browser\b/, `${fileName} should not read legacy browser context`);
    assert.doesNotMatch(source, /context\.runtime\b/, `${fileName} should not read legacy runtime context`);
    assert.doesNotMatch(source, /from "\.\.\/providers\/refine-/, `${fileName} should not import provider seams`);
  }

  assert.doesNotMatch(refineBrowserServiceSource, /from "\.\.\/providers\/refine-browser-provider\.js"/);
  assert.doesNotMatch(refineRunServiceSource, /from "\.\.\/providers\/refine-runtime-provider\.js"/);
  assert.doesNotMatch(refineBrowserServiceSource, /from "\.\.\/\.\.\/\.\.\/infrastructure\//);
  assert.doesNotMatch(refineRunServiceSource, /from "\.\.\/\.\.\/\.\.\/infrastructure\//);

  assert.equal(existsSync(path.join(srcRoot, "application/refine/tools/providers/refine-browser-provider.ts")), false);
  assert.equal(existsSync(path.join(srcRoot, "application/refine/tools/providers/refine-runtime-provider.ts")), false);
  assert.equal(existsSync(path.join(srcRoot, "application/refine/tools/runtime/refine-browser-tools.ts")), false);
  assert.equal(existsSync(path.join(srcRoot, "application/refine/tools/runtime/refine-runtime-tools.ts")), false);
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
