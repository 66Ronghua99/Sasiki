/**
 * Deps: node:fs/promises, node:os, node:path, domain/sop-asset.ts, domain/runtime-errors.ts
 * Used By: application/observe/observe-executor.ts
 * Last Updated: 2026-03-21
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { RuntimeError } from "../../domain/runtime-errors.js";
import type { SopAsset, SopAssetQuery } from "../../domain/sop-asset.js";

export const DEFAULT_SOP_ASSET_ROOT_DIR = "~/.sasiki/sop_assets";

interface SopAssetIndex {
  version: "v0";
  updatedAt: string;
  assets: SopAsset[];
}

export class SopAssetStore {
  private readonly rootDir: string;
  private readonly indexPath: string;

  constructor(rootDir = DEFAULT_SOP_ASSET_ROOT_DIR) {
    this.rootDir = this.expandHome(rootDir);
    this.indexPath = path.join(this.rootDir, "index.json");
  }

  async upsert(asset: SopAsset): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    const current = await this.readAssets();
    const merged = current.filter((item) => item.assetId !== asset.assetId);
    merged.push(asset);
    merged.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    await this.writeAssets(merged);
  }

  async search(query: SopAssetQuery): Promise<SopAsset[]> {
    const all = await this.readAssets();
    const filtered = all.filter((asset) => this.matches(asset, query));
    const limit = typeof query.limit === "number" && query.limit > 0 ? Math.floor(query.limit) : 20;
    return filtered.slice(0, limit);
  }

  async getById(assetId: string): Promise<SopAsset | null> {
    const all = await this.readAssets();
    const found = all.find((asset) => asset.assetId === assetId);
    return found ?? null;
  }

  private async readAssets(): Promise<SopAsset[]> {
    try {
      const raw = await readFile(this.indexPath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<SopAssetIndex>;
      if (!Array.isArray(parsed.assets)) {
        return [];
      }
      return parsed.assets;
    } catch {
      return [];
    }
  }

  private async writeAssets(assets: SopAsset[]): Promise<void> {
    const payload: SopAssetIndex = {
      version: "v0",
      updatedAt: new Date().toISOString(),
      assets,
    };
    try {
      await writeFile(this.indexPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
    } catch (error) {
      throw new RuntimeError("SOP_ASSET_INDEX_WRITE_FAILED", "failed to write SOP asset index", {
        indexPath: this.indexPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private matches(asset: SopAsset, query: SopAssetQuery): boolean {
    if (query.site && asset.site !== query.site) {
      return false;
    }
    if (query.tag && !asset.tags.includes(query.tag)) {
      return false;
    }
    if (!query.taskHint) {
      return true;
    }
    return asset.taskHint.toLowerCase().includes(query.taskHint.toLowerCase());
  }

  private expandHome(inputPath: string): string {
    if (inputPath.startsWith("~/")) {
      return path.join(homedir(), inputPath.slice(2));
    }
    if (inputPath === "~") {
      return homedir();
    }
    return inputPath;
  }
}
