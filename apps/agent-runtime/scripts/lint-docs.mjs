#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "../..");

const requiredPaths = [
  "PROGRESS.md",
  "NEXT_STEP.md",
  "MEMORY.md",
  "AGENT_INDEX.md",
  ".harness/bootstrap.toml",
  "docs/architecture/overview.md",
  "docs/architecture/layers.md",
  "docs/testing/strategy.md",
  "docs/project/current-state.md",
  "docs/project/README.md",
];

const requiredDocCollections = [
  "docs/superpowers/specs",
  "docs/superpowers/plans",
];

const referenceScanFiles = [
  "docs/architecture/overview.md",
  "docs/project/README.md",
  "docs/project/current-state.md",
  "docs/testing/strategy.md",
  "PROGRESS.md",
  "MEMORY.md",
  "NEXT_STEP.md",
];

function verifyRequiredPaths() {
  const missing = [];
  for (const relPath of requiredPaths) {
    const absPath = path.join(workspaceRoot, relPath);
    if (!fs.existsSync(absPath)) {
      missing.push(relPath);
    }
  }

  if (missing.length > 0) {
    for (const relPath of missing) {
      console.error(`ERROR [docs.required-path] missing required path: ${relPath}`);
    }
    return 1;
  }
  return 0;
}

function verifyRequiredCollections() {
  let failed = false;
  for (const relPath of requiredDocCollections) {
    const absPath = path.join(workspaceRoot, relPath);
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
      console.error(`ERROR [docs.required-collection] missing required directory: ${relPath}`);
      failed = true;
      continue;
    }
    const markdownFiles = fs.readdirSync(absPath).filter((name) => name.endsWith(".md"));
    if (markdownFiles.length === 0) {
      console.error(`ERROR [docs.required-collection] directory has no markdown docs: ${relPath}`);
      failed = true;
    }
  }
  return failed ? 1 : 0;
}

function collectPathCandidates(text) {
  const candidates = new Set();
  const inlineCodeRegex = /`([^`]+)`/g;
  const markdownLinkRegex = /\[[^\]]+\]\(([^)]+)\)/g;

  for (const regex of [inlineCodeRegex, markdownLinkRegex]) {
    let match;
    while ((match = regex.exec(text))) {
      const raw = match[1].trim();
      if (!raw) {
        continue;
      }
      if (/^https?:\/\//i.test(raw)) {
        continue;
      }
      if (raw.includes("*")) {
        continue;
      }
      if (raw.startsWith("npm ") || raw.startsWith("node ")) {
        continue;
      }
      if (/\s/.test(raw)) {
        continue;
      }
      if (
        raw.startsWith("docs/") ||
        raw.startsWith(".harness/") ||
        raw.startsWith("artifacts/") ||
        raw.endsWith(".md") ||
        raw.endsWith(".toml") ||
        raw.endsWith(".json")
      ) {
        candidates.add(raw.replace(/#.+$/, ""));
      }
    }
  }

  return [...candidates];
}

function verifyReferencedPaths() {
  const errors = [];
  for (const relPath of referenceScanFiles) {
    const absPath = path.join(workspaceRoot, relPath);
    if (!fs.existsSync(absPath)) {
      continue;
    }
    const content = fs.readFileSync(absPath, "utf8");
    const candidates = collectPathCandidates(content);
    for (const candidate of candidates) {
      if (candidate.startsWith("artifacts/")) {
        continue;
      }
      const target = path.join(workspaceRoot, candidate);
      if (!fs.existsSync(target)) {
        errors.push({ source: relPath, target: candidate });
      }
    }
  }

  if (errors.length > 0) {
    for (const item of errors) {
      console.error(`ERROR [docs.reference-path] ${item.source} references missing path: ${item.target}`);
    }
    return 1;
  }
  return 0;
}

function main() {
  let exitCode = 0;

  exitCode ||= verifyRequiredPaths();
  exitCode ||= verifyRequiredCollections();
  exitCode ||= verifyReferencedPaths();

  if (exitCode !== 0) {
    process.exit(exitCode);
  }

  console.log("lint-docs: governance path checks passed");
}

main();
