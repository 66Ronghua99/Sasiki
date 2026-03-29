import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export interface DesktopSkillMetadata {
  name: string;
  description: string;
}

export interface DesktopSkillStoreOptions {
  rootDir: string;
}

export class DesktopSkillStore {
  private readonly rootDir: string;

  constructor(options: DesktopSkillStoreOptions) {
    this.rootDir = this.expandHome(options.rootDir);
  }

  async listMetadata(): Promise<DesktopSkillMetadata[]> {
    const entries = await this.readSkillDirectoryEntries();
    const metadata: DesktopSkillMetadata[] = [];

    for (const entry of entries) {
      const skillPath = path.join(this.rootDir, entry, "SKILL.md");
      const parsed = await this.readSkillDocument(skillPath);
      metadata.push(parsed);
    }

    metadata.sort((left, right) => left.name.localeCompare(right.name));
    return metadata;
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

  private async readSkillDocument(skillPath: string): Promise<DesktopSkillMetadata> {
    let raw: string;
    try {
      raw = await readFile(skillPath, "utf8");
    } catch (error) {
      if (this.isMissingFileError(error)) {
        throw new Error(`skill document missing: ${skillPath}`);
      }
      throw error;
    }

    return parseSkillDocument(raw, skillPath);
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

function parseSkillDocument(raw: string, skillPath: string): DesktopSkillMetadata {
  const normalized = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n(?:\r?\n)*)?([\s\S]*)$/);
  if (!match) {
    throw new Error(`invalid skill frontmatter: ${skillPath}`);
  }

  const frontmatter = parseFrontmatterLines(match[1], skillPath);
  if (!frontmatter.name || !frontmatter.description) {
    throw new Error(`skill frontmatter must include name and description: ${skillPath}`);
  }

  return {
    name: frontmatter.name,
    description: frontmatter.description,
  };
}

function parseFrontmatterLines(frontmatterText: string, skillPath: string): {
  name?: string;
  description?: string;
} {
  const result: { name?: string; description?: string } = {};
  for (const line of frontmatterText.split(/\r?\n/)) {
    if (line.trim() === "") {
      continue;
    }
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      throw new Error(`invalid skill frontmatter line: ${skillPath}`);
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key === "name") {
      result.name = value;
    } else if (key === "description") {
      result.description = value;
    }
  }

  return result;
}
