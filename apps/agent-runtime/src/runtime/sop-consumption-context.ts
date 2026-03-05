/**
 * Deps: node:fs/promises, node:path, domain/sop-asset.ts, domain/sop-consumption.ts, runtime/sop-asset-store.ts
 * Used By: runtime/workflow-runtime.ts
 * Last Updated: 2026-03-05
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { SopAsset, WebElementHint } from "../domain/sop-asset.js";
import type { SopConsumptionRecord, SopConsumptionResult } from "../domain/sop-consumption.js";
import type { SopAssetStore } from "./sop-asset-store.js";

export interface SopConsumptionContextOptions {
  enabled: boolean;
  topN: number;
  hintsLimit: number;
  maxGuideChars: number;
  assetStore: SopAssetStore;
}

interface GuidePayload {
  source: "semantic" | "asset" | "none";
  guidePath?: string;
  markdown?: string;
}

export class SopConsumptionContextBuilder {
  private readonly options: SopConsumptionContextOptions;

  constructor(options: SopConsumptionContextOptions) {
    this.options = options;
  }

  async build(task: string): Promise<SopConsumptionResult> {
    if (!this.options.enabled) {
      return this.toFallback(task, { enabled: false, fallbackReason: "consumption_disabled" });
    }

    try {
      return await this.buildInternal(task);
    } catch (error) {
      return this.toFallback(task, {
        enabled: true,
        fallbackReason: error instanceof Error ? `build_failed:${error.message}` : "build_failed",
      });
    }
  }

  private async buildInternal(task: string): Promise<SopConsumptionResult> {
    const siteHint = this.detectSiteHint(task);
    const candidates = await this.findCandidates(task, siteHint);
    if (candidates.length === 0) {
      return this.toFallback(task, {
        enabled: true,
        siteHint,
        candidateAssetIds: [],
        candidateCount: 0,
        fallbackReason: "no_matching_asset",
      });
    }

    const selected = candidates[0];
    const guide = await this.loadGuide(selected);
    const hints = this.pickHints(selected.webElementHints);
    if (!guide.markdown && hints.length === 0) {
      return this.toFallback(task, {
        enabled: true,
        siteHint,
        selectedAssetId: selected.assetId,
        candidateAssetIds: candidates.map((item) => item.assetId),
        candidateCount: candidates.length,
        fallbackReason: "guide_and_hints_unavailable",
      });
    }

    return {
      taskForLoop: this.composeAugmentedTask(task, selected, guide.markdown, hints),
      record: {
        enabled: true,
        originalTask: task,
        injected: true,
        selectedAssetId: selected.assetId,
        candidateAssetIds: candidates.map((item) => item.assetId),
        candidateCount: candidates.length,
        siteHint,
        guideSource: guide.source,
        guidePath: guide.guidePath,
        fallbackUsed: false,
        usedHints: hints,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  private async findCandidates(task: string, siteHint?: string): Promise<SopAsset[]> {
    const baseQuery = {
      taskHint: task,
      limit: this.normalizeLimit(this.options.topN, 3),
    };
    if (siteHint) {
      const strict = await this.options.assetStore.search({ ...baseQuery, site: siteHint });
      if (strict.length > 0) {
        return strict;
      }
    }
    return this.options.assetStore.search(baseQuery);
  }

  private async loadGuide(asset: SopAsset): Promise<GuidePayload> {
    const semanticPath = path.join(path.dirname(asset.tracePath), "guide_semantic.md");
    const semanticMarkdown = await this.readMarkdown(semanticPath);
    if (semanticMarkdown) {
      return {
        source: "semantic",
        guidePath: semanticPath,
        markdown: semanticMarkdown,
      };
    }

    const assetMarkdown = await this.readMarkdown(asset.guidePath);
    if (assetMarkdown) {
      return {
        source: "asset",
        guidePath: asset.guidePath,
        markdown: assetMarkdown,
      };
    }

    return { source: "none" };
  }

  private async readMarkdown(filePath: string | undefined): Promise<string | undefined> {
    if (!filePath?.trim()) {
      return undefined;
    }
    try {
      const raw = await readFile(filePath, "utf-8");
      const trimmed = raw.trim();
      if (!trimmed) {
        return undefined;
      }
      const max = this.normalizeLimit(this.options.maxGuideChars, 4000);
      if (trimmed.length <= max) {
        return trimmed;
      }
      return `${trimmed.slice(0, max)}\n[guide truncated due to maxGuideChars]`;
    } catch {
      return undefined;
    }
  }

  private pickHints(hints: WebElementHint[]): WebElementHint[] {
    const limit = this.normalizeLimit(this.options.hintsLimit, 8);
    const unique = new Map<string, WebElementHint>();
    for (const hint of hints) {
      const key = [hint.purpose, hint.selector ?? "", hint.textHint ?? "", hint.roleHint ?? ""].join("|");
      if (!unique.has(key)) {
        unique.set(key, hint);
      }
      if (unique.size >= limit) {
        break;
      }
    }
    return [...unique.values()];
  }

  private composeAugmentedTask(task: string, asset: SopAsset, guide: string | undefined, hints: WebElementHint[]): string {
    const lines: string[] = [];
    lines.push(task);
    lines.push("");
    lines.push("[SOP Reference - lower priority than live page observation]");
    lines.push(`asset_id: ${asset.assetId}`);
    lines.push(`asset_site: ${asset.site}`);
    lines.push("If SOP guidance conflicts with current page reality, trust current page reality.");

    if (guide) {
      lines.push("");
      lines.push("Guide:");
      lines.push(guide);
    }

    if (hints.length > 0) {
      lines.push("");
      lines.push("Web element hints:");
      for (let index = 0; index < hints.length; index += 1) {
        lines.push(`${index + 1}. ${this.formatHint(hints[index])}`);
      }
    }

    return `${lines.join("\n")}\n`;
  }

  private formatHint(hint: WebElementHint): string {
    const segments: string[] = [`purpose=${hint.purpose}`];
    if (hint.selector) {
      segments.push(`selector=${hint.selector}`);
    }
    if (hint.textHint) {
      segments.push(`text=${hint.textHint}`);
    }
    if (hint.roleHint) {
      segments.push(`role=${hint.roleHint}`);
    }
    return segments.join(" | ");
  }

  private detectSiteHint(task: string): string | undefined {
    const urlMatch = task.match(/https?:\/\/[^\s)\]"'>]+/i);
    if (!urlMatch) {
      return undefined;
    }
    try {
      const host = new URL(urlMatch[0]).hostname.trim().toLowerCase();
      return host || undefined;
    } catch {
      return undefined;
    }
  }

  private toFallback(
    task: string,
    input: {
      enabled: boolean;
      siteHint?: string;
      selectedAssetId?: string;
      candidateAssetIds?: string[];
      candidateCount?: number;
      fallbackReason: string;
    }
  ): SopConsumptionResult {
    return {
      taskForLoop: task,
      record: {
        enabled: input.enabled,
        originalTask: task,
        injected: false,
        selectedAssetId: input.selectedAssetId,
        candidateAssetIds: input.candidateAssetIds ?? [],
        candidateCount: input.candidateCount ?? (input.candidateAssetIds?.length ?? 0),
        siteHint: input.siteHint,
        guideSource: "none",
        fallbackUsed: true,
        fallbackReason: input.fallbackReason,
        usedHints: [],
        generatedAt: new Date().toISOString(),
      },
    };
  }

  private normalizeLimit(value: number, fallback: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }
    return Math.max(1, Math.floor(value));
  }
}
