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
  ["runtime/replay-refinement/online-refinement-run-executor.ts", 840],
  ["runtime/replay-refinement/refinement-decision-engine.ts", 670],
]);

const LAYER_ORDER = ["domain", "contracts", "core", "runtime", "infrastructure"];
const ALLOWED_DEPENDENCIES = {
  domain: new Set(["domain", "contracts"]),
  contracts: new Set(["domain", "contracts"]),
  core: new Set(["domain", "contracts", "core"]),
  runtime: new Set(["domain", "contracts", "core", "runtime", "infrastructure"]),
  infrastructure: new Set(["domain", "contracts", "infrastructure"]),
};

const errors = [];
const warnings = [];

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

function relFromSrc(absPath) {
  return normalize(path.relative(srcRoot, absPath));
}

function inferLayer(absPath) {
  const rel = relFromSrc(absPath);
  const [first] = rel.split("/");
  return LAYER_ORDER.includes(first) ? first : "other";
}

function resolveImportPath(fileAbs, spec) {
  if (!spec.startsWith(".")) {
    return null;
  }
  const base = path.resolve(path.dirname(fileAbs), spec);
  const candidates = [base, `${base}.ts`, path.join(base, "index.ts")];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function addError(ruleId, fileRel, message) {
  errors.push({ ruleId, fileRel, message });
}

function addWarning(ruleId, fileRel, message) {
  warnings.push({ ruleId, fileRel, message });
}

function checkFileSize(absPath, sourceText) {
  const rel = relFromSrc(absPath);
  const lines = sourceText.split(/\r?\n/).length;
  const maxLines = LEGACY_MAX_LINES.get(rel) ?? DEFAULT_MAX_LINES;
  if (lines > maxLines) {
    addError(
      "size.file.max-lines",
      rel,
      `line count ${lines} exceeds budget ${maxLines}. Split responsibilities or raise budget with explicit review.`
    );
    return;
  }

  if (!LEGACY_MAX_LINES.has(rel) && lines > Math.floor(DEFAULT_MAX_LINES * 0.9)) {
    addWarning(
      "size.file.near-limit",
      rel,
      `line count ${lines} is near budget ${DEFAULT_MAX_LINES}. Consider extracting sub-modules.`
    );
  }
}

function checkImports(absPath, sourceText) {
  const fromRel = relFromSrc(absPath);
  const fromLayer = inferLayer(absPath);
  const importRegex = /^import\s+[\s\S]*?\sfrom\s+["']([^"']+)["'];?/gm;

  let match;
  while ((match = importRegex.exec(sourceText))) {
    const spec = match[1];

    if (spec === "@modelcontextprotocol/sdk") {
      if (!fromRel.startsWith("infrastructure/mcp/")) {
        addError(
          "dep.mcp.sdk.boundary",
          fromRel,
          `@modelcontextprotocol/sdk must only be imported under infrastructure/mcp, found in ${fromRel}.`
        );
      }
    }

    const targetAbs = resolveImportPath(absPath, spec);
    if (!targetAbs) {
      continue;
    }

    const toRel = relFromSrc(targetAbs);
    const toLayer = inferLayer(targetAbs);

    if (toRel.startsWith("infrastructure/mcp/") && fromRel !== "runtime/workflow-runtime.ts" && !fromRel.startsWith("infrastructure/mcp/")) {
      addError(
        "dep.infra.mcp.entrypoint",
        fromRel,
        `Only runtime/workflow-runtime.ts may import infrastructure/mcp directly, found import to ${toRel}.`
      );
    }

    if (fromLayer !== "other") {
      const allowed = ALLOWED_DEPENDENCIES[fromLayer];
      if (allowed && !allowed.has(toLayer)) {
        addError(
          "dep.layer.direction",
          fromRel,
          `Layer ${fromLayer} cannot depend on ${toLayer} (${spec} -> ${toRel}).`
        );
      }
    }
  }
}

function main() {
  if (!fs.existsSync(srcRoot)) {
    console.error(`[lint-architecture] missing src root: ${srcRoot}`);
    process.exit(1);
  }

  const files = listTsFiles(srcRoot);
  for (const absPath of files) {
    const sourceText = fs.readFileSync(absPath, "utf8");
    checkFileSize(absPath, sourceText);
    checkImports(absPath, sourceText);
  }

  for (const issue of warnings) {
    console.warn(`WARN  [${issue.ruleId}] ${issue.fileRel}: ${issue.message}`);
  }
  for (const issue of errors) {
    console.error(`ERROR [${issue.ruleId}] ${issue.fileRel}: ${issue.message}`);
  }

  const summary = `lint-architecture: ${files.length} files, ${errors.length} error(s), ${warnings.length} warning(s)`;
  if (errors.length > 0) {
    console.error(summary);
    process.exit(1);
  }

  console.log(summary);
}

main();
