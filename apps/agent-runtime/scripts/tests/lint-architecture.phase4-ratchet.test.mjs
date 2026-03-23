import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { analyzeArchitecture } from "../lint-architecture.mjs";

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeFiles(srcRoot, files) {
  for (const [relPath, content] of Object.entries(files)) {
    writeFile(path.join(srcRoot, relPath), content);
  }
}

function issueKey(issue) {
  return `${issue.ruleId}|${issue.fileRel}|${issue.message}`;
}

function assertIssues(actualIssues, expectedIssues) {
  assert.deepEqual(
    actualIssues.map(issueKey).sort(),
    expectedIssues.map(issueKey).sort(),
  );
}

test("reports removed kernel and config loader allowances after phase 3", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-arch-phase4-kernel-config-"));
  const srcRoot = path.join(tmpDir, "src");

  writeFiles(srcRoot, {
    "kernel/pi-agent-loop.ts": [
      'import { agentTypes } from "../domain/agent-types.js";',
      'import { highLevelLog } from "../domain/high-level-log.js";',
      'import { modelResolver } from "../infrastructure/llm/model-resolver.js";',
      "export const value = [agentTypes, highLevelLog, modelResolver];",
      "",
    ].join("\n"),
    "domain/agent-types.ts": "export const agentTypes = 1;\n",
    "domain/high-level-log.ts": "export const highLevelLog = 1;\n",
    "infrastructure/llm/model-resolver.ts": "export const modelResolver = 1;\n",
    "application/config/runtime-config-loader.ts": [
      'import { loadRuntimeBootstrapSources } from "../../infrastructure/config/runtime-bootstrap-provider.js";',
      "export const value = loadRuntimeBootstrapSources;",
      "",
    ].join("\n"),
    "infrastructure/config/runtime-bootstrap-provider.ts": "export const loadRuntimeBootstrapSources = 1;\n",
  });

  const result = analyzeArchitecture({ srcRoot });

  assertIssues(result.errors, [
    {
      ruleId: "dep.kernel.no-domain",
      fileRel: "kernel/pi-agent-loop.ts",
      message: "kernel must not depend on domain directly (domain/agent-types.ts).",
    },
    {
      ruleId: "dep.kernel.no-domain",
      fileRel: "kernel/pi-agent-loop.ts",
      message: "kernel must not depend on domain directly (domain/high-level-log.ts).",
    },
    {
      ruleId: "dep.kernel.no-infrastructure",
      fileRel: "kernel/pi-agent-loop.ts",
      message: "kernel must not depend on infrastructure directly (infrastructure/llm/model-resolver.ts).",
    },
    {
      ruleId: "dep.application.config.no-infra-source-loader",
      fileRel: "application/config/runtime-config-loader.ts",
      message: "application/config must not import infrastructure config source loaders directly (infrastructure/config/runtime-bootstrap-provider.ts).",
    },
  ]);
});

test("reports removed observe, compact, and refine assembly allowances after phase 3", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-arch-phase4-assembly-"));
  const srcRoot = path.join(tmpDir, "src");

  writeFiles(srcRoot, {
    "application/observe/observe-workflow-factory.ts": [
      'import { PlaywrightDemonstrationRecorder } from "../../infrastructure/browser/playwright-demonstration-recorder.js";',
      'import { RuntimeLogger } from "../../infrastructure/logging/runtime-logger.js";',
      "export const value = [PlaywrightDemonstrationRecorder, RuntimeLogger];",
      "",
    ].join("\n"),
    "infrastructure/browser/playwright-demonstration-recorder.ts": "export const PlaywrightDemonstrationRecorder = 1;\n",
    "infrastructure/logging/runtime-logger.ts": "export const RuntimeLogger = 1;\n",
    "application/observe/observe-executor.ts": [
      'import { PlaywrightDemonstrationRecorder } from "../../infrastructure/browser/playwright-demonstration-recorder.js";',
      'import { ArtifactsWriter } from "../../infrastructure/persistence/artifacts-writer.js";',
      'import { SopAssetStore } from "../../infrastructure/persistence/sop-asset-store.js";',
      "export const value = [PlaywrightDemonstrationRecorder, ArtifactsWriter, SopAssetStore];",
      "",
    ].join("\n"),
    "infrastructure/persistence/artifacts-writer.ts": "export const ArtifactsWriter = 1;\n",
    "infrastructure/persistence/sop-asset-store.ts": "export const SopAssetStore = 1;\n",
    "application/compact/interactive-sop-compact.ts": [
      'import { JsonModelClient } from "../../infrastructure/llm/json-model-client.js";',
      'import { TerminalCompactHumanLoopTool } from "../../infrastructure/hitl/terminal-compact-human-loop-tool.js";',
      'import { ArtifactsWriter } from "../../infrastructure/persistence/artifacts-writer.js";',
      "export const value = [JsonModelClient, TerminalCompactHumanLoopTool, ArtifactsWriter];",
      "",
    ].join("\n"),
    "infrastructure/llm/json-model-client.ts": "export const JsonModelClient = 1;\n",
    "infrastructure/hitl/terminal-compact-human-loop-tool.ts": "export const TerminalCompactHumanLoopTool = 1;\n",
    "application/refine/refine-run-bootstrap-provider.ts": [
      'import { AttentionKnowledgeStore } from "../../infrastructure/persistence/attention-knowledge-store.js";',
      'import { RefineHitlResumeStore } from "../../infrastructure/persistence/refine-hitl-resume-store.js";',
      "export const value = [AttentionKnowledgeStore, RefineHitlResumeStore];",
      "",
    ].join("\n"),
    "application/refine/attention-guidance-loader.ts": [
      'import type { AttentionKnowledgeStore } from "../../infrastructure/persistence/attention-knowledge-store.js";',
      "export const value = AttentionKnowledgeStore;",
      "",
    ].join("\n"),
    "infrastructure/persistence/attention-knowledge-store.ts": "export const AttentionKnowledgeStore = 1;\n",
    "infrastructure/persistence/refine-hitl-resume-store.ts": "export const RefineHitlResumeStore = 1;\n",
    "application/refine/react-refinement-run-executor.ts": [
      'import { ArtifactsWriter } from "../../infrastructure/persistence/artifacts-writer.js";',
      "export const value = ArtifactsWriter;",
      "",
    ].join("\n"),
  });

  const result = analyzeArchitecture({ srcRoot });

  assertIssues(result.errors, [
    {
      ruleId: "dep.application.non-shell.no-infrastructure",
      fileRel: "application/observe/observe-workflow-factory.ts",
      message: "Only application/shell may import infrastructure directly in Phase 1 (infrastructure/browser/playwright-demonstration-recorder.ts).",
    },
    {
      ruleId: "dep.application.non-shell.no-infrastructure",
      fileRel: "application/observe/observe-workflow-factory.ts",
      message: "Only application/shell may import infrastructure directly in Phase 1 (infrastructure/logging/runtime-logger.ts).",
    },
    {
      ruleId: "dep.application.non-shell.no-infrastructure",
      fileRel: "application/observe/observe-executor.ts",
      message: "Only application/shell may import infrastructure directly in Phase 1 (infrastructure/browser/playwright-demonstration-recorder.ts).",
    },
    {
      ruleId: "dep.application.non-shell.no-infrastructure",
      fileRel: "application/observe/observe-executor.ts",
      message: "Only application/shell may import infrastructure directly in Phase 1 (infrastructure/persistence/artifacts-writer.ts).",
    },
    {
      ruleId: "dep.application.non-shell.no-infrastructure",
      fileRel: "application/observe/observe-executor.ts",
      message: "Only application/shell may import infrastructure directly in Phase 1 (infrastructure/persistence/sop-asset-store.ts).",
    },
    {
      ruleId: "dep.application.non-shell.no-infrastructure",
      fileRel: "application/compact/interactive-sop-compact.ts",
      message: "Only application/shell may import infrastructure directly in Phase 1 (infrastructure/llm/json-model-client.ts).",
    },
    {
      ruleId: "dep.application.non-shell.no-infrastructure",
      fileRel: "application/compact/interactive-sop-compact.ts",
      message: "Only application/shell may import infrastructure directly in Phase 1 (infrastructure/hitl/terminal-compact-human-loop-tool.ts).",
    },
    {
      ruleId: "dep.application.non-shell.no-infrastructure",
      fileRel: "application/compact/interactive-sop-compact.ts",
      message: "Only application/shell may import infrastructure directly in Phase 1 (infrastructure/persistence/artifacts-writer.ts).",
    },
    {
      ruleId: "dep.application.non-shell.no-infrastructure",
      fileRel: "application/refine/refine-run-bootstrap-provider.ts",
      message: "Only application/shell may import infrastructure directly in Phase 1 (infrastructure/persistence/attention-knowledge-store.ts).",
    },
    {
      ruleId: "dep.application.non-shell.no-infrastructure",
      fileRel: "application/refine/refine-run-bootstrap-provider.ts",
      message: "Only application/shell may import infrastructure directly in Phase 1 (infrastructure/persistence/refine-hitl-resume-store.ts).",
    },
    {
      ruleId: "dep.application.non-shell.no-infrastructure",
      fileRel: "application/refine/attention-guidance-loader.ts",
      message: "Only application/shell may import infrastructure directly in Phase 1 (infrastructure/persistence/attention-knowledge-store.ts).",
    },
    {
      ruleId: "dep.application.non-shell.no-infrastructure",
      fileRel: "application/refine/react-refinement-run-executor.ts",
      message: "Only application/shell may import infrastructure directly in Phase 1 (infrastructure/persistence/artifacts-writer.ts).",
    },
  ]);
});

test("rejects the old refine-tools provider/runtime split", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-arch-phase4-refine-tools-"));
  const srcRoot = path.join(tmpDir, "src");

  writeFiles(srcRoot, {
    "application/refine/tools/providers/refine-browser-provider.ts": [
      'import { RefineBrowserTools } from "../runtime/refine-browser-tools.js";',
      "export const value = RefineBrowserTools;",
      "",
    ].join("\n"),
    "application/refine/tools/runtime/refine-browser-tools.ts": [
      'import { RefineBrowserProvider } from "../providers/refine-browser-provider.js";',
      "export const RefineBrowserTools = RefineBrowserProvider;",
      "",
    ].join("\n"),
  });

  const result = analyzeArchitecture({ srcRoot });

  assertIssues(result.errors, [
    {
      ruleId: "dep.import.cycle",
      fileRel: "application/refine/tools/providers/refine-browser-provider.ts",
      message: "import cycle detected: application/refine/tools/providers/refine-browser-provider.ts -> application/refine/tools/runtime/refine-browser-tools.ts -> application/refine/tools/providers/refine-browser-provider.ts",
    },
    {
      ruleId: "dep.refine-tools.providers.no-file",
      fileRel: "application/refine/tools/providers/refine-browser-provider.ts",
      message: "Refine tool providers are retired; do not add files under application/refine/tools/providers/.",
    },
    {
      ruleId: "dep.refine-tools.providers.no-runtime",
      fileRel: "application/refine/tools/providers/refine-browser-provider.ts",
      message: "Refine tool providers must not depend on refine tool runtime (application/refine/tools/runtime/refine-browser-tools.ts).",
    },
    {
      ruleId: "dep.refine-tools.runtime.no-file",
      fileRel: "application/refine/tools/runtime/refine-browser-tools.ts",
      message: "Refine tool runtime is retired; do not add files under application/refine/tools/runtime/.",
    },
    {
      ruleId: "dep.refine-tools.runtime.no-providers",
      fileRel: "application/refine/tools/runtime/refine-browser-tools.ts",
      message: "Refine tool runtime must not depend on refine tool providers (application/refine/tools/providers/refine-browser-provider.ts).",
    },
  ]);
});

test("rejects refine-tools re-exports across the retired seam", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-arch-phase4-refine-exports-"));
  const srcRoot = path.join(tmpDir, "src");

  writeFiles(srcRoot, {
    "application/refine/tools/providers/refine-browser-provider.ts": [
      'export * from "../runtime/refine-browser-tools.js";',
      "export const providerValue = 1;",
      "",
    ].join("\n"),
    "application/refine/tools/runtime/refine-browser-tools.ts": [
      'export { providerValue } from "../providers/refine-browser-provider.js";',
      "export const runtimeValue = 1;",
      "",
    ].join("\n"),
  });

  const result = analyzeArchitecture({ srcRoot });

  assertIssues(result.errors, [
    {
      ruleId: "dep.import.cycle",
      fileRel: "application/refine/tools/providers/refine-browser-provider.ts",
      message: "import cycle detected: application/refine/tools/providers/refine-browser-provider.ts -> application/refine/tools/runtime/refine-browser-tools.ts -> application/refine/tools/providers/refine-browser-provider.ts",
    },
    {
      ruleId: "dep.refine-tools.providers.no-file",
      fileRel: "application/refine/tools/providers/refine-browser-provider.ts",
      message: "Refine tool providers are retired; do not add files under application/refine/tools/providers/.",
    },
    {
      ruleId: "dep.refine-tools.providers.no-runtime",
      fileRel: "application/refine/tools/providers/refine-browser-provider.ts",
      message: "Refine tool providers must not depend on refine tool runtime (application/refine/tools/runtime/refine-browser-tools.ts).",
    },
    {
      ruleId: "dep.refine-tools.runtime.no-file",
      fileRel: "application/refine/tools/runtime/refine-browser-tools.ts",
      message: "Refine tool runtime is retired; do not add files under application/refine/tools/runtime/.",
    },
    {
      ruleId: "dep.refine-tools.runtime.no-providers",
      fileRel: "application/refine/tools/runtime/refine-browser-tools.ts",
      message: "Refine tool runtime must not depend on refine tool providers (application/refine/tools/providers/refine-browser-provider.ts).",
    },
  ]);
});

test("rejects side-effect imports across the retired refine-tools seam", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-arch-phase4-refine-side-effects-"));
  const srcRoot = path.join(tmpDir, "src");

  writeFiles(srcRoot, {
    "application/refine/tools/providers/refine-browser-provider.ts": [
      'import "../runtime/refine-browser-tools.js";',
      "export const providerValue = 1;",
      "",
    ].join("\n"),
    "application/refine/tools/runtime/refine-browser-tools.ts": [
      'import "../providers/refine-browser-provider.js";',
      "export const runtimeValue = 1;",
      "",
    ].join("\n"),
  });

  const result = analyzeArchitecture({ srcRoot });

  assertIssues(result.errors, [
    {
      ruleId: "dep.import.cycle",
      fileRel: "application/refine/tools/providers/refine-browser-provider.ts",
      message: "import cycle detected: application/refine/tools/providers/refine-browser-provider.ts -> application/refine/tools/runtime/refine-browser-tools.ts -> application/refine/tools/providers/refine-browser-provider.ts",
    },
    {
      ruleId: "dep.refine-tools.providers.no-file",
      fileRel: "application/refine/tools/providers/refine-browser-provider.ts",
      message: "Refine tool providers are retired; do not add files under application/refine/tools/providers/.",
    },
    {
      ruleId: "dep.refine-tools.providers.no-runtime",
      fileRel: "application/refine/tools/providers/refine-browser-provider.ts",
      message: "Refine tool providers must not depend on refine tool runtime (application/refine/tools/runtime/refine-browser-tools.ts).",
    },
    {
      ruleId: "dep.refine-tools.runtime.no-file",
      fileRel: "application/refine/tools/runtime/refine-browser-tools.ts",
      message: "Refine tool runtime is retired; do not add files under application/refine/tools/runtime/.",
    },
    {
      ruleId: "dep.refine-tools.runtime.no-providers",
      fileRel: "application/refine/tools/runtime/refine-browser-tools.ts",
      message: "Refine tool runtime must not depend on refine tool providers (application/refine/tools/providers/refine-browser-provider.ts).",
    },
  ]);
});

test("rejects standalone refine-tools provider files", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-arch-phase4-refine-provider-"));
  const srcRoot = path.join(tmpDir, "src");

  writeFiles(srcRoot, {
    "application/refine/tools/providers/refine-browser-provider.ts": "export const value = 1;\n",
  });

  const result = analyzeArchitecture({ srcRoot });

  assertIssues(result.errors, [
    {
      ruleId: "dep.refine-tools.providers.no-file",
      fileRel: "application/refine/tools/providers/refine-browser-provider.ts",
      message: "Refine tool providers are retired; do not add files under application/refine/tools/providers/.",
    },
  ]);
});

test("rejects standalone refine-tools runtime files", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-arch-phase4-refine-runtime-"));
  const srcRoot = path.join(tmpDir, "src");

  writeFiles(srcRoot, {
    "application/refine/tools/runtime/refine-browser-tools.ts": "export const value = 1;\n",
  });

  const result = analyzeArchitecture({ srcRoot });

  assertIssues(result.errors, [
    {
      ruleId: "dep.refine-tools.runtime.no-file",
      fileRel: "application/refine/tools/runtime/refine-browser-tools.ts",
      message: "Refine tool runtime is retired; do not add files under application/refine/tools/runtime/.",
    },
  ]);
});
