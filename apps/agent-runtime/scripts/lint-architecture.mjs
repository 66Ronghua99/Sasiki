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
  ["core/agent-loop.ts", 760],
  ["runtime/run-executor.ts", 780],
]);

const LAYER_ORDER = ["domain", "contracts", "core", "runtime", "infrastructure"];
const ALLOWED_DEPENDENCIES = {
  domain: new Set(["domain", "contracts"]),
  contracts: new Set(["domain", "contracts"]),
  core: new Set(["domain", "contracts", "core"]),
  runtime: new Set(["domain", "contracts", "core", "runtime", "infrastructure"]),
  infrastructure: new Set(["domain", "contracts", "infrastructure"]),
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

    if (toRel.startsWith("infrastructure/mcp/") && fromRel !== "runtime/workflow-runtime.ts" && !fromRel.startsWith("infrastructure/mcp/")) {
      errors.push(addError(
        "dep.infra.mcp.entrypoint",
        fromRel,
        `Only runtime/workflow-runtime.ts may import infrastructure/mcp directly, found import to ${toRel}.`
      ));
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
