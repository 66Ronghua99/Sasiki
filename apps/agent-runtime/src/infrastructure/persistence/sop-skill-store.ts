/**
 * Deps: node:fs/promises, node:os, node:path, domain/sop-skill.ts
 * Used By: application/refine/refine-run-bootstrap-provider.ts
 * Last Updated: 2026-03-27
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import {
  SopSkillStoreError,
  type SopSkillDocument,
  type SopSkillMetadata,
  type SopSkillWriteInput,
  type SopSkillWriteResult,
} from "../../domain/sop-skill.js";

// Canonical durable skill root: ~/.sasiki/skills/<skill-name>/SKILL.md.
export const DEFAULT_SOP_SKILL_ROOT_DIR = "~/.sasiki/skills";
const SOP_SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface ParsedSkillDocument {
  metadata: SopSkillMetadata;
  body: string;
}

export class SopSkillStore {
  private readonly rootDir: string;

  constructor(rootDir = DEFAULT_SOP_SKILL_ROOT_DIR) {
    this.rootDir = this.expandHome(rootDir);
  }

  async listMetadata(): Promise<SopSkillMetadata[]> {
    const entries = await this.readSkillDirectoryEntries();
    const metadata: SopSkillMetadata[] = [];

    for (const entry of entries) {
      const skillPath = path.join(this.rootDir, entry, "SKILL.md");
      const parsed = await this.readSkillDocument(skillPath, entry);
      metadata.push(parsed.metadata);
    }

    metadata.sort((left, right) => {
      if (left.name < right.name) {
        return -1;
      }
      if (left.name > right.name) {
        return 1;
      }
      return 0;
    });

    return metadata;
  }

  async readSkill(name: string): Promise<SopSkillDocument> {
    this.assertValidSkillName(name);
    const skillPath = path.join(this.rootDir, name, "SKILL.md");

    let raw: string;
    try {
      raw = await readFile(skillPath, "utf8");
    } catch (error) {
      if (this.isMissingFileError(error)) {
        throw new SopSkillStoreError("SOP_SKILL_NOT_FOUND", `skill not found: ${name}`, {
          name,
          path: skillPath,
        });
      }
      throw error;
    }

    const parsed = this.parseSkillDocument(raw, skillPath);
    this.assertSkillNameMatches(name, parsed.metadata.name, skillPath);
    return {
      name: parsed.metadata.name,
      description: parsed.metadata.description,
      body: parsed.body,
      path: skillPath,
    };
  }

  async writeSkill(input: SopSkillWriteInput): Promise<SopSkillWriteResult> {
    this.assertValidSkillName(input.name);
    const description = this.assertNonEmptyDocumentField(input.description, "description");
    const body = this.assertNonEmptyDocumentField(input.body, "body");
    const sourceObserveRunId = this.assertNonEmptyDocumentField(input.sourceObserveRunId, "sourceObserveRunId");
    const skillDir = path.join(this.rootDir, input.name);
    const skillPath = path.join(skillDir, "SKILL.md");

    await mkdir(skillDir, { recursive: true });
    await writeFile(
      skillPath,
      renderSkillDocument({
        name: input.name,
        description,
        body,
        sourceObserveRunId,
      }),
      "utf8"
    );

    return { skillPath };
  }

  private async readSkillDirectoryEntries(): Promise<string[]> {
    try {
      const entries = await readdir(this.rootDir, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error) {
      if (this.isMissingFileError(error)) {
        return [];
      }
      throw error;
    }
  }

  private async readSkillDocument(skillPath: string, directoryName: string): Promise<ParsedSkillDocument> {
    let raw: string;
    try {
      raw = await readFile(skillPath, "utf8");
    } catch (error) {
      if (this.isMissingFileError(error)) {
        throw new SopSkillStoreError("SOP_SKILL_NOT_FOUND", `skill document missing: ${directoryName}`, {
          name: directoryName,
          path: skillPath,
        });
      }
      throw error;
    }

    const parsed = this.parseSkillDocument(raw, skillPath);
    this.assertSkillNameMatches(directoryName, parsed.metadata.name, skillPath);
    return parsed;
  }

  private parseSkillDocument(raw: string, skillPath: string): ParsedSkillDocument {
    const parsed = parseSkillFrontmatter(raw, skillPath);
    this.assertNonEmptyDocumentField(parsed.body, "body");
    return {
      metadata: {
        name: parsed.name,
        description: parsed.description,
      },
      body: parsed.body,
    };
  }

  private assertValidSkillName(name: string): void {
    if (typeof name !== "string" || name.trim() === "") {
      throw new SopSkillStoreError("SOP_SKILL_INVALID_REFERENCE", "skill name must be a non-empty string", {
        name,
      });
    }
    if (
      name === "." ||
      name === ".." ||
      name.includes("/") ||
      name.includes("\\") ||
      !SOP_SKILL_NAME_PATTERN.test(name)
    ) {
      throw new SopSkillStoreError("SOP_SKILL_INVALID_REFERENCE", `invalid skill name: ${name}`, {
        name,
      });
    }
  }

  private assertSkillNameMatches(expectedName: string, actualName: string, skillPath: string): void {
    if (expectedName === actualName) {
      return;
    }
    throw new SopSkillStoreError(
      "SOP_SKILL_NAME_MISMATCH",
      `skill name mismatch: expected ${expectedName}, got ${actualName}`,
      {
        expectedName,
        actualName,
        path: skillPath,
      }
    );
  }

  private assertNonEmptyDocumentField(value: unknown, field: string): string {
    if (typeof value !== "string" || value.trim() === "") {
      throw new SopSkillStoreError(
        "SOP_SKILL_INVALID_DOCUMENT",
        `skill document field must be a non-empty string: ${field}`,
        { field }
      );
    }
    return value.trim();
  }

  private isMissingFileError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("ENOENT");
  }

  private expandHome(inputPath: string): string {
    if (inputPath === "~") {
      return homedir();
    }
    if (inputPath.startsWith("~/")) {
      return path.join(homedir(), inputPath.slice(2));
    }
    return path.resolve(inputPath);
  }
}

function parseSkillFrontmatter(raw: string, skillPath: string): { name: string; description: string; body: string } {
  const normalized = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n(?:\r?\n)*)?([\s\S]*)$/);
  if (!match) {
    throw new SopSkillStoreError("SOP_SKILL_INVALID_FRONTMATTER", `invalid skill frontmatter: ${skillPath}`, {
      path: skillPath,
    });
  }

  const frontmatter = parseFrontmatterLines(match[1], skillPath);
  const body = match[2];

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    body,
  };
}

function parseFrontmatterLines(
  frontmatterText: string,
  skillPath: string
): { name: string; description: string } {
  let name: string | undefined;
  let description: string | undefined;

  for (const line of frontmatterText.split(/\r?\n/)) {
    if (line.trim() === "") {
      continue;
    }
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      throw new SopSkillStoreError("SOP_SKILL_INVALID_FRONTMATTER", `invalid skill frontmatter line: ${skillPath}`, {
        path: skillPath,
        line,
      });
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = parseYamlScalar(line.slice(separatorIndex + 1).trim());

    if (key === "name") {
      name = value;
      continue;
    }
    if (key === "description") {
      description = value;
    }
  }

  if (!name || !description) {
    throw new SopSkillStoreError("SOP_SKILL_INVALID_FRONTMATTER", `skill frontmatter must include name and description: ${skillPath}`, {
      path: skillPath,
      missingName: !name,
      missingDescription: !description,
    });
  }

  return { name, description };
}

// Supported scalar contract: plain scalars or single/double-quoted scalars for required fields.
function parseYamlScalar(value: string): string {
  if (value.length < 2) {
    return value;
  }
  const first = value[0];
  const last = value[value.length - 1];
  if (first === '"' && last === '"') {
    return parseDoubleQuotedScalar(value);
  }
  if (first === "'" && last === "'") {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function parseDoubleQuotedScalar(value: string): string {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== "string") {
      throw new Error("quoted scalar must decode to string");
    }
    return parsed;
  } catch (error) {
    throw new SopSkillStoreError("SOP_SKILL_INVALID_FRONTMATTER", "invalid quoted scalar in skill frontmatter", {
      value,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function renderSkillDocument(input: {
  name: string;
  description: string;
  body: string;
  sourceObserveRunId: string;
}): string {
  const body = input.body.endsWith("\n") ? input.body : `${input.body}\n`;
  return [
    "---",
    `name: ${formatYamlScalar(input.name)}`,
    `description: ${formatYamlScalar(input.description)}`,
    `source_observe_run_id: ${formatYamlScalar(input.sourceObserveRunId)}`,
    "---",
    "",
    body,
  ].join("\n");
}

function formatYamlScalar(value: string): string {
  if (/^[A-Za-z0-9._/-]+$/.test(value) && !value.includes(":")) {
    return value;
  }
  return JSON.stringify(value);
}
