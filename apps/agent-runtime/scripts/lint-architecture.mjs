#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(projectRoot, "src");

const DEFAULT_MAX_LINES = 500;
const LEGACY_MAX_LINES = new Map([
  ["kernel/pi-agent-loop.ts", 840],
]);
const COMPOSITION_ROOT_FILE = "application/shell/runtime-composition-root.ts";
const REFINE_EXECUTOR_FILE = "application/refine/react-refinement-run-executor.ts";
const APPROVED_TOP_LEVEL_ROOTS = new Set([
  "application",
  "contracts",
  "domain",
  "infrastructure",
  "kernel",
  "utils",
]);
const DEPRECATED_TOP_LEVEL_ROOTS = new Set(["core", "runtime"]);
const FORBIDDEN_APPLICATION_IMPORTS = new Set([
  "runtime/artifacts-writer.ts",
  "runtime/agent-execution-runtime.ts",
  "runtime/runtime-config.ts",
  "runtime/system-prompts.ts",
  "runtime/observe-support/sop-demonstration-recorder.ts",
  "runtime/observe-support/sop-trace-builder.ts",
  "runtime/observe-support/sop-trace-guide-builder.ts",
  "runtime/replay-refinement/attention-guidance-loader.ts",
  "runtime/replay-refinement/refine-react-session.ts",
  "runtime/replay-refinement/refine-react-tool-client.ts",
  "runtime/replay-refinement/refine-runtime-tools.ts",
  "runtime/replay-refinement/refine-browser-tools.ts",
  "runtime/replay-refinement/refine-browser-snapshot-parser.ts",
  "runtime/replay-refinement/react-refinement-run-executor.ts",
  "runtime/replay-refinement/attention-knowledge-store.ts",
  "runtime/replay-refinement/refine-hitl-resume-store.ts",
]);
const CLI_ENTRY_FILES = new Set([
  "index.ts",
]);
const EXECUTOR_FILES = new Set([
  REFINE_EXECUTOR_FILE,
]);

const LAYER_ORDER = ["domain", "contracts", "kernel", "application", "core", "runtime", "infrastructure", "utils"];
const ALLOWED_DEPENDENCIES = {
  domain: new Set(["domain", "utils"]),
  contracts: new Set(["domain", "contracts", "utils"]),
  kernel: new Set(["contracts", "kernel", "utils"]),
  application: new Set(["domain", "contracts", "kernel", "infrastructure", "utils", "application"]),
  core: new Set(["domain", "contracts", "core", "kernel", "utils"]),
  runtime: new Set(["domain", "contracts", "kernel", "runtime", "infrastructure", "utils"]),
  infrastructure: new Set(["domain", "contracts", "infrastructure", "utils"]),
  utils: new Set(["utils"]),
};
const APPLICATION_SUBLAYERS = new Set(["shell", "config", "observe", "compact", "refine"]);
const WORKFLOW_SUBLAYERS = new Set(["observe", "compact", "refine"]);
const REFINE_TOOLS_ROLE_PREFIX = "application/refine/tools/";
const PHASE1_EXCEPTION_LEDGER = [
  {
    fileRel: "kernel/pi-agent-loop.ts",
    ruleId: "dep.kernel.no-domain",
    reason: "The current kernel loop still materializes product-facing run and log record types in Phase 1.",
    toRel: "domain/agent-types.ts",
  },
  {
    fileRel: "kernel/pi-agent-loop.ts",
    ruleId: "dep.kernel.no-domain",
    reason: "The current kernel loop still materializes product-facing run and log record types in Phase 1.",
    toRel: "domain/high-level-log.ts",
  },
  {
    fileRel: "kernel/pi-agent-loop.ts",
    ruleId: "dep.kernel.no-infrastructure",
    reason: "The current kernel loop still resolves models through the infrastructure-backed model resolver in Phase 1.",
    toRel: "infrastructure/llm/model-resolver.ts",
  },
  {
    fileRel: "application/config/runtime-config-loader.ts",
    ruleId: "dep.application.config.no-infra-source-loader",
    reason: "Phase 1 keeps the application-facing config loader while bootstrap source loading is still transitional.",
    toRel: "infrastructure/config/runtime-bootstrap-provider.ts",
  },
  {
    fileRel: "application/observe/observe-workflow-factory.ts",
    ruleId: "dep.application.non-shell.no-infrastructure",
    reason: "Observe workflow factory still constructs the recorder directly in the current Phase 1 baseline.",
    toRel: "infrastructure/browser/playwright-demonstration-recorder.ts",
  },
  {
    fileRel: "application/observe/observe-workflow-factory.ts",
    ruleId: "dep.application.non-shell.no-infrastructure",
    reason: "Observe workflow factory still consumes the concrete runtime logger in the current Phase 1 baseline.",
    toRel: "infrastructure/logging/runtime-logger.ts",
  },
  {
    fileRel: "application/observe/observe-executor.ts",
    ruleId: "dep.application.non-shell.no-infrastructure",
    reason: "Observe executor still owns recorder and persistence collaborators in Phase 1.",
    toRel: "infrastructure/browser/playwright-demonstration-recorder.ts",
  },
  {
    fileRel: "application/observe/observe-executor.ts",
    ruleId: "dep.application.non-shell.no-infrastructure",
    reason: "Observe executor still owns recorder and persistence collaborators in Phase 1.",
    toRel: "infrastructure/persistence/artifacts-writer.ts",
  },
  {
    fileRel: "application/observe/observe-executor.ts",
    ruleId: "dep.application.non-shell.no-infrastructure",
    reason: "Observe executor still owns recorder and persistence collaborators in Phase 1.",
    toRel: "infrastructure/persistence/sop-asset-store.ts",
  },
  {
    fileRel: "application/compact/interactive-sop-compact.ts",
    ruleId: "dep.application.non-shell.no-infrastructure",
    reason: "Compact still assembles concrete model, HITL, and artifact collaborators inside the workflow service.",
    toRel: "infrastructure/llm/json-model-client.ts",
  },
  {
    fileRel: "application/compact/interactive-sop-compact.ts",
    ruleId: "dep.application.non-shell.no-infrastructure",
    reason: "Compact still assembles concrete model, HITL, and artifact collaborators inside the workflow service.",
    toRel: "infrastructure/hitl/terminal-compact-human-loop-tool.ts",
  },
  {
    fileRel: "application/compact/interactive-sop-compact.ts",
    ruleId: "dep.application.non-shell.no-infrastructure",
    reason: "Compact still assembles concrete model, HITL, and artifact collaborators inside the workflow service.",
    toRel: "infrastructure/persistence/artifacts-writer.ts",
  },
  {
    fileRel: "application/refine/refine-run-bootstrap-provider.ts",
    ruleId: "dep.application.non-shell.no-infrastructure",
    reason: "Refine bootstrap still touches persistence adapters directly during the Phase 1 transition.",
    toRel: "infrastructure/persistence/attention-knowledge-store.ts",
  },
  {
    fileRel: "application/refine/refine-run-bootstrap-provider.ts",
    ruleId: "dep.application.non-shell.no-infrastructure",
    reason: "Refine bootstrap still touches persistence adapters directly during the Phase 1 transition.",
    toRel: "infrastructure/persistence/refine-hitl-resume-store.ts",
  },
  {
    fileRel: "application/refine/attention-guidance-loader.ts",
    ruleId: "dep.application.non-shell.no-infrastructure",
    reason: "Refine attention loading still reads concrete persistence in the current Phase 1 baseline.",
    toRel: "infrastructure/persistence/attention-knowledge-store.ts",
  },
  {
    fileRel: "application/refine/react-refinement-run-executor.ts",
    ruleId: "dep.application.non-shell.no-infrastructure",
    reason: "Refine executor still writes artifacts directly in the current Phase 1 baseline.",
    toRel: "infrastructure/persistence/artifacts-writer.ts",
  },
  {
    fileRel: "application/refine/tools/providers/refine-browser-provider.ts",
    ruleId: "dep.refine-tools.providers.no-runtime",
    reason: "Provider/runtime bridging remains a named transitional seam in Phase 1.",
    toRel: "application/refine/tools/runtime/refine-browser-tools.ts",
  },
  {
    fileRel: "application/refine/tools/providers/refine-browser-provider.ts",
    ruleId: "dep.refine-tools.providers.no-refine-module",
    reason: "Provider/runtime bridging still carries session-bound refine semantics in Phase 1.",
    toRel: "application/refine/refine-react-session.ts",
  },
  {
    fileRel: "application/refine/tools/providers/refine-runtime-provider.ts",
    ruleId: "dep.refine-tools.providers.no-runtime",
    reason: "Provider/runtime bridging remains a named transitional seam in Phase 1.",
    toRel: "application/refine/tools/runtime/refine-runtime-tools.ts",
  },
  {
    fileRel: "application/refine/tools/providers/refine-runtime-provider.ts",
    ruleId: "dep.refine-tools.providers.no-refine-module",
    reason: "Provider/runtime bridging still carries session-bound refine semantics in Phase 1.",
    toRel: "application/refine/refine-react-session.ts",
  },
  {
    fileRel: "application/refine/tools/runtime/refine-browser-tools.ts",
    ruleId: "dep.refine-tools.runtime.no-domain",
    reason: "Runtime/browser tool payload shaping still depends on refine domain records in Phase 1.",
    toRel: "domain/refine-react.ts",
  },
  {
    fileRel: "application/refine/tools/runtime/refine-browser-tools.ts",
    ruleId: "dep.refine-tools.runtime.no-refine-module",
    reason: "Runtime/browser tool payload shaping still depends on refine-owned session/parser seams in Phase 1.",
    toRel: "application/refine/refine-browser-snapshot-parser.ts",
  },
  {
    fileRel: "application/refine/tools/runtime/refine-browser-tools.ts",
    ruleId: "dep.refine-tools.runtime.no-refine-module",
    reason: "Runtime/browser tool payload shaping still depends on refine-owned session/parser seams in Phase 1.",
    toRel: "application/refine/refine-react-session.ts",
  },
  {
    fileRel: "application/refine/tools/runtime/refine-runtime-tools.ts",
    ruleId: "dep.refine-tools.runtime.no-domain",
    reason: "Runtime/tool payload shaping still depends on refine domain records in Phase 1.",
    toRel: "domain/attention-knowledge.ts",
  },
  {
    fileRel: "application/refine/tools/runtime/refine-runtime-tools.ts",
    ruleId: "dep.refine-tools.runtime.no-domain",
    reason: "Runtime/tool payload shaping still depends on refine domain records in Phase 1.",
    toRel: "domain/refine-react.ts",
  },
  {
    fileRel: "application/refine/tools/runtime/refine-runtime-tools.ts",
    ruleId: "dep.refine-tools.runtime.no-refine-module",
    reason: "Runtime/tool payload shaping still depends on refine-owned session seams in Phase 1.",
    toRel: "application/refine/refine-react-session.ts",
  },
];

function listTsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function normalize(filePath) {
  return filePath.replace(/\\/g, "/");
}

function relFromSrc(absPath, srcRoot) {
  return normalize(path.relative(srcRoot, absPath));
}

function inferLayer(absPath, srcRoot) {
  const rel = relFromSrc(absPath, srcRoot);
  const [first] = rel.split("/");
  return LAYER_ORDER.includes(first) ? first : "other";
}

function inferApplicationSublayer(relPath) {
  const [root, sublayer] = relPath.split("/");
  if (root !== "application") {
    return null;
  }
  return APPLICATION_SUBLAYERS.has(sublayer) ? sublayer : null;
}

function inferRefineToolsRole(relPath) {
  if (!relPath.startsWith(REFINE_TOOLS_ROLE_PREFIX)) {
    return null;
  }
  const rest = relPath.slice(REFINE_TOOLS_ROLE_PREFIX.length);
  if (rest.startsWith("definitions/")) {
    return "definitions";
  }
  if (rest.startsWith("providers/")) {
    return "providers";
  }
  if (rest.startsWith("runtime/")) {
    return "runtime";
  }
  return "composition-core";
}

function isPhase1Exception({ ruleId, fileRel, toRel }) {
  return PHASE1_EXCEPTION_LEDGER.some((entry) => (
    entry.ruleId === ruleId
    && entry.fileRel === fileRel
    && (entry.toRel ? entry.toRel === toRel : true)
  ));
}

function maybeAddPhase1Error(errors, { ruleId, fileRel, toRel, message }) {
  if (isPhase1Exception({ ruleId, fileRel, toRel })) {
    return;
  }
  errors.push(addError(ruleId, fileRel, message));
}

function resolveImportPath(fileAbs, spec) {
  if (!spec.startsWith(".")) {
    return null;
  }
  const base = path.resolve(path.dirname(fileAbs), spec);
  const candidates = [
    base,
    `${base}.ts`,
    path.join(base, "index.ts"),
  ];

  if (base.endsWith(".js") || base.endsWith(".mjs") || base.endsWith(".cjs")) {
    const withoutExt = base.replace(/\.(mjs|cjs|js)$/u, "");
    candidates.push(`${withoutExt}.ts`);
    candidates.push(path.join(withoutExt, "index.ts"));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function addError(ruleId, fileRel, message) {
  return { ruleId, fileRel, message };
}

function addWarning(ruleId, fileRel, message) {
  return { ruleId, fileRel, message };
}

function checkTopLevelPathPolicy(absPath, errors, srcRoot) {
  const rel = relFromSrc(absPath, srcRoot);
  const segments = rel.split("/");
  const [first] = segments;

  if (segments.length === 1) {
    if (rel !== "index.ts") {
      errors.push(addError(
        "root.file.not-allowed",
        rel,
        "Only src/index.ts may live at the top level of src in Phase 1."
      ));
    }
    return;
  }

  if (DEPRECATED_TOP_LEVEL_ROOTS.has(first)) {
    errors.push(addError(
      "root.deprecated",
      rel,
      `Top-level root ${first}/ is banned in Phase 1. New src/${first}/* files are not allowed.`
    ));
    return;
  }

  if (!APPROVED_TOP_LEVEL_ROOTS.has(first)) {
    errors.push(addError(
      "root.top-level-allowlist",
      rel,
      `Top-level root ${first}/ is not approved. Allowed roots: ${[...APPROVED_TOP_LEVEL_ROOTS].sort().join(", ")}.`
    ));
  }
}

function checkFileSize(absPath, sourceText, errors, warnings, srcRoot) {
  const rel = relFromSrc(absPath, srcRoot);
  const lines = sourceText.split(/\r?\n/).length;
  const maxLines = LEGACY_MAX_LINES.get(rel) ?? DEFAULT_MAX_LINES;
  if (lines > maxLines) {
    errors.push(addError(
      "size.file.max-lines",
      rel,
      `line count ${lines} exceeds budget ${maxLines}. Split responsibilities or raise budget with explicit review.`,
    ));
    return;
  }

  if (!LEGACY_MAX_LINES.has(rel) && lines > Math.floor(DEFAULT_MAX_LINES * 0.9)) {
    warnings.push(addWarning(
      "size.file.near-limit",
      rel,
      `line count ${lines} is near budget ${DEFAULT_MAX_LINES}. Consider extracting sub-modules.`
    ));
  }
}

function checkApplicationImportRules({ fromRel, toRel, fromLayer, toLayer, errors }) {
  if (fromLayer !== "application") {
    return;
  }

  const fromAppLayer = inferApplicationSublayer(fromRel);
  const toAppLayer = inferApplicationSublayer(toRel);

  if (!fromAppLayer) {
    return;
  }

  if (fromAppLayer === "config" && toAppLayer === "shell") {
    maybeAddPhase1Error(errors, {
      ruleId: "dep.application.config.no-shell",
      fileRel: fromRel,
      toRel,
      message: `application/config must not depend on application/shell (${toRel}).`,
    });
  }

  if (
    WORKFLOW_SUBLAYERS.has(fromAppLayer)
    && toAppLayer
    && WORKFLOW_SUBLAYERS.has(toAppLayer)
    && fromAppLayer !== toAppLayer
  ) {
    maybeAddPhase1Error(errors, {
      ruleId: "dep.application.workflow.horizontal",
      fileRel: fromRel,
      toRel,
      message: `Workflow sublayer ${fromAppLayer} must not depend on sibling workflow sublayer ${toAppLayer} (${toRel}).`,
    });
  }

  if (fromAppLayer === "config" && toRel.startsWith("infrastructure/config/")) {
    maybeAddPhase1Error(errors, {
      ruleId: "dep.application.config.no-infra-source-loader",
      fileRel: fromRel,
      toRel,
      message: `application/config must not import infrastructure config source loaders directly (${toRel}).`,
    });
    return;
  }

  if (fromAppLayer !== "shell" && toLayer === "infrastructure") {
    maybeAddPhase1Error(errors, {
      ruleId: "dep.application.non-shell.no-infrastructure",
      fileRel: fromRel,
      toRel,
      message: `Only application/shell may import infrastructure directly in Phase 1 (${toRel}).`,
    });
  }
}

function checkKernelImportRules({ fromRel, toRel, fromLayer, toLayer, errors }) {
  if (fromLayer !== "kernel") {
    return false;
  }

  if (toLayer === "domain") {
    maybeAddPhase1Error(errors, {
      ruleId: "dep.kernel.no-domain",
      fileRel: fromRel,
      toRel,
      message: `kernel must not depend on domain directly in Phase 1 unless explicitly ledgered (${toRel}).`,
    });
    return true;
  }

  if (toLayer === "infrastructure") {
    maybeAddPhase1Error(errors, {
      ruleId: "dep.kernel.no-infrastructure",
      fileRel: fromRel,
      toRel,
      message: `kernel must not depend on infrastructure directly in Phase 1 unless explicitly ledgered (${toRel}).`,
    });
    return true;
  }

  return false;
}

function checkRefineToolImportRules({ fromRel, toRel, toLayer, errors }) {
  const fromRole = inferRefineToolsRole(fromRel);
  if (!fromRole) {
    return;
  }

  const toRole = inferRefineToolsRole(toRel);

  if (fromRole === "definitions" && toRole === "runtime") {
    maybeAddPhase1Error(errors, {
      ruleId: "dep.refine-tools.definitions.no-runtime",
      fileRel: fromRel,
      toRel,
      message: `Refine tool definitions must not depend on refine tool runtime (${toRel}).`,
    });
  }

  if (fromRole === "definitions" && toLayer === "infrastructure") {
    maybeAddPhase1Error(errors, {
      ruleId: "dep.refine-tools.definitions.no-infrastructure",
      fileRel: fromRel,
      toRel,
      message: `Refine tool definitions must not import infrastructure directly (${toRel}).`,
    });
  }

  if (fromRole === "runtime" && toRole === "definitions") {
    maybeAddPhase1Error(errors, {
      ruleId: "dep.refine-tools.runtime.no-definitions",
      fileRel: fromRel,
      toRel,
      message: `Refine tool runtime must not depend on tool definitions (${toRel}).`,
    });
  }

  if (fromRole === "providers" && toRole === "runtime") {
    maybeAddPhase1Error(errors, {
      ruleId: "dep.refine-tools.providers.no-runtime",
      fileRel: fromRel,
      toRel,
      message: `Refine tool providers must not depend on refine tool runtime unless explicitly ledgered (${toRel}).`,
    });
  }

  if (fromRole === "providers" && toLayer === "infrastructure") {
    maybeAddPhase1Error(errors, {
      ruleId: "dep.refine-tools.providers.no-infrastructure",
      fileRel: fromRel,
      toRel,
      message: `Refine tool providers must not import infrastructure directly (${toRel}).`,
    });
  }

  if (fromRole === "providers" && toRel.startsWith("application/refine/") && !toRel.startsWith(REFINE_TOOLS_ROLE_PREFIX)) {
    maybeAddPhase1Error(errors, {
      ruleId: "dep.refine-tools.providers.no-refine-module",
      fileRel: fromRel,
      toRel,
      message: `Refine tool providers must not depend on non-tools refine modules unless explicitly ledgered (${toRel}).`,
    });
  }

  if (fromRole === "runtime" && toLayer === "domain") {
    maybeAddPhase1Error(errors, {
      ruleId: "dep.refine-tools.runtime.no-domain",
      fileRel: fromRel,
      toRel,
      message: `Refine tool runtime must not depend on domain types unless explicitly ledgered (${toRel}).`,
    });
  }

  if (fromRole === "runtime" && toRel.startsWith("application/refine/") && !toRel.startsWith(REFINE_TOOLS_ROLE_PREFIX)) {
    maybeAddPhase1Error(errors, {
      ruleId: "dep.refine-tools.runtime.no-refine-module",
      fileRel: fromRel,
      toRel,
      message: `Refine tool runtime must not depend on non-tools refine modules unless explicitly ledgered (${toRel}).`,
    });
  }
}

function checkImports(absPath, sourceText, errors, srcRoot) {
  const fromRel = relFromSrc(absPath, srcRoot);
  const fromLayer = inferLayer(absPath, srcRoot);
  const importRegex = /^import\s+[\s\S]*?\sfrom\s+["']([^"']+)["'];?/gm;
  const localDependencies = new Set();

  let match;
  while ((match = importRegex.exec(sourceText))) {
    const spec = match[1];

    if (spec === "@modelcontextprotocol/sdk") {
      if (!fromRel.startsWith("infrastructure/mcp/")) {
        errors.push(addError(
          "dep.mcp.sdk.boundary",
          fromRel,
          `@modelcontextprotocol/sdk must only be imported under infrastructure/mcp, found in ${fromRel}.`
        ));
      }
    }

    const targetAbs = resolveImportPath(absPath, spec);
    if (!targetAbs) {
      continue;
    }

    const toRel = relFromSrc(targetAbs, srcRoot);
    const toLayer = inferLayer(targetAbs, srcRoot);

    if (!toRel.startsWith("..")) {
      localDependencies.add(toRel);
    }

    checkApplicationImportRules({ fromRel, toRel, fromLayer, toLayer, errors });
    const kernelEdgeHandled = checkKernelImportRules({ fromRel, toRel, fromLayer, toLayer, errors });
    checkRefineToolImportRules({ fromRel, toRel, toLayer, errors });

    if (toRel.startsWith("infrastructure/mcp/") && fromRel !== COMPOSITION_ROOT_FILE && !fromRel.startsWith("infrastructure/mcp/")) {
      errors.push(addError(
        "dep.infra.mcp.entrypoint",
        fromRel,
        `Only ${COMPOSITION_ROOT_FILE} may import infrastructure/mcp directly, found import to ${toRel}.`
      ));
    }

    if (fromLayer === "application" && FORBIDDEN_APPLICATION_IMPORTS.has(toRel)) {
      errors.push(addError(
        "dep.application.no-runtime-shim",
        fromRel,
        `Application code must import the canonical owner module instead of runtime shim ${toRel}.`
      ));
    }

    if (
      fromRel === REFINE_EXECUTOR_FILE &&
      [
        "application/refine/attention-guidance-loader.ts",
        "infrastructure/persistence/attention-knowledge-store.ts",
        "infrastructure/persistence/refine-hitl-resume-store.ts",
      ].includes(toRel)
    ) {
      errors.push(addError(
        "dep.executor.refine-bootstrap-boundary",
        fromRel,
        `Refine executor must consume prepared bootstrap/collaborator input instead of importing ${toRel} directly.`
      ));
    }

    if (CLI_ENTRY_FILES.has(fromRel)) {
      if (toRel.startsWith("infrastructure/")) {
        errors.push(addError(
          "dep.cli.no-infra-assembly",
          fromRel,
          `CLI entrypoints must not import infrastructure modules directly (${spec} -> ${toRel}).`
        ));
      }
      if (EXECUTOR_FILES.has(toRel)) {
        errors.push(addError(
          "dep.cli.no-executor-import",
          fromRel,
          `CLI entrypoints must not import executor implementations directly (${spec} -> ${toRel}).`
        ));
      }
    }

    if (kernelEdgeHandled) {
      continue;
    }

    if (fromLayer !== "other") {
      const allowed = ALLOWED_DEPENDENCIES[fromLayer];
      if (allowed && !allowed.has(toLayer)) {
        errors.push(addError(
          "dep.layer.direction",
          fromRel,
          `Layer ${fromLayer} cannot depend on ${toLayer} (${spec} -> ${toRel}).`
        ));
      }
    }
  }

  return localDependencies;
}

function checkForbiddenCompatFiles(absPath, errors, srcRoot) {
  void absPath;
  void errors;
  void srcRoot;
}

function canonicalizeCycle(cyclePath) {
  const nodes = cyclePath.slice(0, -1);
  if (nodes.length === 0) {
    return null;
  }
  let best = nodes;
  for (let index = 1; index < nodes.length; index += 1) {
    const rotated = nodes.slice(index).concat(nodes.slice(0, index));
    if (rotated.join("->") < best.join("->")) {
      best = rotated;
    }
  }
  const fileRel = best[0];
  const displayPath = best.concat(best[0]).join(" -> ");
  return {
    key: best.join("->"),
    fileRel,
    displayPath,
  };
}

function detectImportCycles(graph, errors) {
  const nodes = [...graph.keys()].sort();
  const visiting = [];
  const visitingSet = new Set();
  const visited = new Set();
  const seenCycles = new Set();

  const visit = (node) => {
    if (visited.has(node)) {
      return;
    }

    visiting.push(node);
    visitingSet.add(node);

    const dependencies = graph.get(node) ?? new Set();
    for (const dep of dependencies) {
      if (!graph.has(dep)) {
        continue;
      }
      if (visitingSet.has(dep)) {
        const cycleStart = visiting.indexOf(dep);
        const cyclePath = visiting.slice(cycleStart).concat(dep);
        const cycle = canonicalizeCycle(cyclePath);
        if (cycle && !seenCycles.has(cycle.key)) {
          seenCycles.add(cycle.key);
          errors.push(addError(
            "dep.import.cycle",
            cycle.fileRel,
            `import cycle detected: ${cycle.displayPath}`,
          ));
        }
        continue;
      }
      if (!visited.has(dep)) {
        visit(dep);
      }
    }

    visiting.pop();
    visitingSet.delete(node);
    visited.add(node);
  };

  for (const node of nodes) {
    if (!visited.has(node)) {
      visit(node);
    }
  }
}

export function analyzeArchitecture({ srcRoot }) {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(srcRoot)) {
    errors.push(addError("lint.config", ".", `missing src root: ${srcRoot}`));
    return {
      filesAnalyzed: 0,
      errors,
      warnings,
    };
  }

  const files = listTsFiles(srcRoot);
  const graph = new Map();
  for (const absPath of files) {
    const sourceText = fs.readFileSync(absPath, "utf8");
    checkTopLevelPathPolicy(absPath, errors, srcRoot);
    checkFileSize(absPath, sourceText, errors, warnings, srcRoot);
    checkForbiddenCompatFiles(absPath, errors, srcRoot);
    const localDeps = checkImports(absPath, sourceText, errors, srcRoot);
    graph.set(relFromSrc(absPath, srcRoot), localDeps);
  }
  detectImportCycles(graph, errors);

  return {
    filesAnalyzed: files.length,
    errors,
    warnings,
  };
}

function printIssues(issues, level) {
  const printer = level === "warn" ? console.warn : console.error;
  const prefix = level === "warn" ? "WARN " : "ERROR";
  for (const issue of issues) {
    printer(`${prefix} [${issue.ruleId}] ${issue.fileRel}: ${issue.message}`);
  }
}

function main() {
  const result = analyzeArchitecture({ srcRoot });
  printIssues(result.warnings, "warn");
  printIssues(result.errors, "error");

  const summary = `lint-architecture: ${result.filesAnalyzed} files, ${result.errors.length} error(s), ${result.warnings.length} warning(s)`;
  if (result.errors.length > 0) {
    console.error(summary);
    process.exit(1);
  }

  console.log(summary);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
