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
  ["kernel/agent-loop.ts", 760],
]);
const COMPOSITION_ROOT_FILE = "application/shell/runtime-composition-root.ts";
const PROMPT_PROVIDER_FILE = "runtime/providers/prompt-provider.ts";
const LEGACY_EXECUTOR_FILE = "runtime/run-executor.ts";
const REFINE_EXECUTOR_FILE = "runtime/replay-refinement/react-refinement-run-executor.ts";
const SHIM_ONLY_FILES = new Set([
  "core/agent-loop.ts",
  "core/mcp-tool-bridge.ts",
  "core/sop-demonstration-recorder.ts",
  "core/model-resolver.ts",
  "core/json-model-client.ts",
  "runtime/artifacts-writer.ts",
  "runtime/agent-runtime.ts",
  "runtime/command-router.ts",
  "runtime/runtime-composition-root.ts",
  "runtime/runtime-config.ts",
  "runtime/sop-asset-store.ts",
  "runtime/workflow-runtime.ts",
  "runtime/providers/execution-context-provider.ts",
  "runtime/providers/tool-surface-provider.ts",
  "runtime/replay-refinement/attention-knowledge-store.ts",
  "runtime/replay-refinement/refine-hitl-resume-store.ts",
]);
const CLI_ENTRY_FILES = new Set([
  "index.ts",
  "runtime/command-router.ts",
]);
const EXECUTOR_FILES = new Set([
  LEGACY_EXECUTOR_FILE,
  REFINE_EXECUTOR_FILE,
]);

const LAYER_ORDER = ["domain", "contracts", "kernel", "application", "core", "runtime", "infrastructure", "utils"];
const ALLOWED_DEPENDENCIES = {
  domain: new Set(["domain", "contracts", "utils"]),
  contracts: new Set(["domain", "contracts", "utils"]),
  kernel: new Set(["domain", "contracts", "kernel", "utils"]),
  application: new Set(["domain", "contracts", "kernel", "runtime", "infrastructure", "utils", "application"]),
  core: new Set(["domain", "contracts", "core", "kernel", "utils"]),
  runtime: new Set(["domain", "contracts", "kernel", "runtime", "infrastructure", "utils"]),
  infrastructure: new Set(["domain", "contracts", "infrastructure", "utils"]),
  utils: new Set(["utils"]),
};

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

function stripComments(sourceText) {
  return sourceText
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "")
    .trim();
}

function isBareReexportShim(sourceText) {
  const trimmed = stripComments(sourceText);
  return /^export\s+(?:\*\s+from|\{[\s\S]*?\}\s+from)\s+["'][^"']+["'];?$/u.test(trimmed);
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

function checkImports(absPath, sourceText, errors, srcRoot) {
  const fromRel = relFromSrc(absPath, srcRoot);
  const fromLayer = inferLayer(absPath, srcRoot);
  const isShimOnlyFile = SHIM_ONLY_FILES.has(fromRel) && isBareReexportShim(sourceText);
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

    if (fromRel === "kernel/agent-loop.ts" && toRel === "infrastructure/llm/model-resolver.ts") {
      continue;
    }

    if (toRel.startsWith("infrastructure/mcp/") && fromRel !== COMPOSITION_ROOT_FILE && !fromRel.startsWith("infrastructure/mcp/")) {
      errors.push(addError(
        "dep.infra.mcp.entrypoint",
        fromRel,
        `Only ${COMPOSITION_ROOT_FILE} may import infrastructure/mcp directly, found import to ${toRel}.`
      ));
    }

    if (toRel === "runtime/system-prompts.ts" && fromRel !== PROMPT_PROVIDER_FILE) {
      errors.push(addError(
        "dep.prompt.provider.boundary",
        fromRel,
        `Only ${PROMPT_PROVIDER_FILE} may import runtime/system-prompts.ts directly, found import to ${toRel}.`
      ));
    }

    if (fromRel === LEGACY_EXECUTOR_FILE && toRel === "runtime/sop-consumption-context.ts") {
      errors.push(addError(
        "dep.executor.legacy-bootstrap-boundary",
        fromRel,
        `Legacy executor must consume prepared bootstrap input instead of importing ${toRel} directly.`
      ));
    }

    if (
      fromRel === REFINE_EXECUTOR_FILE &&
      [
        "runtime/replay-refinement/attention-guidance-loader.ts",
        "runtime/replay-refinement/attention-knowledge-store.ts",
        "runtime/replay-refinement/refine-hitl-resume-store.ts",
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

    if (isShimOnlyFile && toLayer === "application") {
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

function checkShimOnlyFiles(absPath, sourceText, errors, srcRoot) {
  const rel = relFromSrc(absPath, srcRoot);
  if (!SHIM_ONLY_FILES.has(rel)) {
    return;
  }
  if (!isBareReexportShim(sourceText)) {
    errors.push(addError(
      "dep.legacy-adapter.shim-only",
      rel,
      "Legacy adapter path may remain only as a temporary re-export shim after Task 3 migration."
    ));
  }
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
    checkFileSize(absPath, sourceText, errors, warnings, srcRoot);
    checkShimOnlyFiles(absPath, sourceText, errors, srcRoot);
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
