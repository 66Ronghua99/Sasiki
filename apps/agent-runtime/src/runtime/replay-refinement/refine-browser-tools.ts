/**
 * Deps: contracts/tool-client.ts, domain/refine-react.ts, runtime/replay-refinement/refine-react-session.ts
 * Used By: runtime/replay-refinement/refine-react-tool-client.ts
 * Last Updated: 2026-03-20
 */
import { URL } from "node:url";

import type { ToolCallResult, ToolClient } from "../../contracts/tool-client.js";
import type {
  ActionExecutionResult,
  ObservePageResponse,
  ObserveQueryMatch,
  ObserveQueryRequest,
  ObserveQueryResponse,
  PageIdentity,
  PageObservation,
} from "../../domain/refine-react.js";
import type { RefineReactSession } from "./refine-react-session.js";

export interface RefineBrowserToolsOptions {
  rawClient: ToolClient;
  session: RefineReactSession;
}

interface SnapshotLineElement {
  role: string;
  elementRef: string;
  rawText: string;
  normalizedText: string;
}

export class RefineBrowserTools {
  private readonly rawClient: ToolClient;
  private session: RefineReactSession;
  private observationCounter = 0;

  constructor(options: RefineBrowserToolsOptions) {
    this.rawClient = options.rawClient;
    this.session = options.session;
  }

  setSession(session: RefineReactSession): void {
    this.session = session;
    this.observationCounter = 0;
  }

  async observePage(): Promise<ObservePageResponse> {
    const snapshotResult = await this.rawClient.callTool("browser_snapshot", {});
    const snapshotText = this.readToolText(snapshotResult);
    const page = this.parsePageIdentity(snapshotText);
    const observation: PageObservation = {
      observationRef: this.createObservationRef(),
      page,
      snapshot: snapshotText,
      capturedAt: new Date().toISOString(),
    };
    this.session.recordObservation(observation);
    return { observation };
  }

  async observeQuery(request: ObserveQueryRequest): Promise<ObserveQueryResponse> {
    const observation = this.session.latestObservation() ?? (await this.observePage()).observation;
    const matches = this.filterSnapshotLines(observation, request);
    return {
      observationRef: observation.observationRef,
      page: {
        origin: observation.page.origin,
        normalizedPath: observation.page.normalizedPath,
      },
      matches,
    };
  }

  async actClick(args: { elementRef: string; sourceObservationRef: string }): Promise<{ result: ActionExecutionResult }> {
    const raw = await this.rawClient.callTool("browser_click", { ref: args.elementRef });
    const result = this.toActionResult("click", args.sourceObservationRef, {
      targetElementRef: args.elementRef,
      message: this.readToolText(raw),
    });
    this.session.recordAction(result);
    return { result };
  }

  async actType(args: {
    elementRef: string;
    sourceObservationRef: string;
    text: string;
    submit?: boolean;
  }): Promise<{ result: ActionExecutionResult }> {
    const raw = await this.rawClient.callTool("browser_type", {
      ref: args.elementRef,
      text: args.text,
      submit: args.submit ?? false,
    });
    const result = this.toActionResult("type", args.sourceObservationRef, {
      targetElementRef: args.elementRef,
      message: this.readToolText(raw),
    });
    this.session.recordAction(result);
    return { result };
  }

  async actPress(args: { key: string; sourceObservationRef: string }): Promise<{ result: ActionExecutionResult }> {
    const raw = await this.rawClient.callTool("browser_press_key", {
      key: args.key,
    });
    const result = this.toActionResult("press", args.sourceObservationRef, {
      message: this.readToolText(raw),
    });
    this.session.recordAction(result);
    return { result };
  }

  async actNavigate(args: { url: string; sourceObservationRef: string }): Promise<{ result: ActionExecutionResult }> {
    const raw = await this.rawClient.callTool("browser_navigate", {
      url: args.url,
    });
    const result = this.toActionResult("navigate", args.sourceObservationRef, {
      message: this.readToolText(raw),
      page: this.pageIdentityFromUrl(args.url, "navigated"),
    });
    this.session.recordAction(result);
    return { result };
  }

  async actScreenshot(args: {
    sourceObservationRef: string;
    fullPage?: boolean;
    filename?: string;
  }): Promise<{ result: ActionExecutionResult }> {
    const rawTools = await this.rawClient.listTools();
    const names = new Set(rawTools.map((tool) => tool.name));
    const candidates: Array<{
      name: string;
      args: Record<string, unknown>[];
    }> = [
      {
        name: "browser_take_screenshot",
        args: this.buildScreenshotArgs(args, {
          includeTypeMode: "always",
        }),
      },
      {
        name: "browser_screenshot",
        args: this.buildScreenshotArgs(args, {
          includeTypeMode: "optional",
        }),
      },
    ];

    let lastError: unknown;
    for (const candidate of candidates) {
      if (!names.has(candidate.name)) {
        continue;
      }
      for (const candidateArgs of candidate.args) {
        try {
          const raw = await this.rawClient.callTool(candidate.name, candidateArgs);
          const result = this.toActionResult("screenshot", args.sourceObservationRef, {
            message: this.readToolText(raw),
            evidenceRef: this.resolveScreenshotEvidenceRef(candidateArgs),
          });
          this.session.recordAction(result);
          return { result };
        } catch (error) {
          lastError = error;
        }
      }
    }

    if (lastError instanceof Error) {
      throw new Error(`act.screenshot failed: ${lastError.message}`);
    }
    throw new Error("act.screenshot failed: no compatible screenshot tool available");
  }

  private createObservationRef(): string {
    this.observationCounter += 1;
    return `obs_${this.session.runId}_${this.observationCounter}`;
  }

  private parsePageIdentity(snapshotText: string): PageIdentity {
    const lines = snapshotText.split("\n").map((line) => line.trim());
    const urlLine = lines.find((line) => line.toLowerCase().startsWith("url:"));
    const titleLine = lines.find((line) => line.toLowerCase().startsWith("title:"));
    const rawUrl = urlLine ? urlLine.slice("url:".length).trim() : "about:blank";
    const rawTitle = titleLine ? titleLine.slice("title:".length).trim() : "Unknown";
    return this.pageIdentityFromUrl(rawUrl, rawTitle);
  }

  private pageIdentityFromUrl(urlValue: string, title: string): PageIdentity {
    try {
      const url = new URL(urlValue);
      return {
        url: url.toString(),
        origin: url.origin,
        normalizedPath: url.pathname || "/",
        title: title.trim() || "Unknown",
      };
    } catch {
      return {
        url: urlValue,
        origin: "unknown",
        normalizedPath: "/",
        title: title.trim() || "Unknown",
      };
    }
  }

  private filterSnapshotLines(observation: PageObservation, request: ObserveQueryRequest): ObserveQueryMatch[] {
    const candidates = this.parseSnapshotElements(observation.snapshot).map((item) => ({
      elementRef: item.elementRef,
      sourceObservationRef: observation.observationRef,
      role: item.role,
      rawText: item.rawText,
      normalizedText: item.normalizedText,
    }));

    const filtered = candidates.filter((candidate) => this.matchesQueryFilter(candidate, request));
    const limited = Number.isFinite(request.limit) && (request.limit ?? 0) > 0 ? filtered.slice(0, request.limit) : filtered;
    return limited;
  }

  private parseSnapshotElements(snapshot: string): SnapshotLineElement[] {
    const lines = snapshot.split("\n");
    const elements: SnapshotLineElement[] = [];
    for (const line of lines) {
      const match = line.match(/^\[(?<role>[^|\]]+)\|(?<ref>[^\]]+)\]\s*(?<text>.*)$/);
      if (!match?.groups) {
        continue;
      }
      const rawText = (match.groups.text ?? "").trim();
      elements.push({
        role: (match.groups.role ?? "").trim().toLowerCase(),
        elementRef: (match.groups.ref ?? "").trim(),
        rawText,
        normalizedText: rawText.toLowerCase(),
      });
    }
    return elements;
  }

  private matchesQueryFilter(match: ObserveQueryMatch, request: ObserveQueryRequest): boolean {
    if (request.mode === "inspect") {
      if (!request.elementRef?.trim()) {
        return false;
      }
      return match.elementRef === request.elementRef.trim();
    }
    if (request.role?.trim()) {
      if (match.role !== request.role.trim().toLowerCase()) {
        return false;
      }
    }
    if (request.text?.trim()) {
      const text = request.text.trim().toLowerCase();
      if (!match.normalizedText.includes(text)) {
        return false;
      }
    }
    return true;
  }

  private readToolText(result: ToolCallResult): string {
    if (typeof result === "string") {
      return result;
    }
    if (Array.isArray(result.content)) {
      for (const block of result.content) {
        if (!block || typeof block !== "object") {
          continue;
        }
        const text = (block as Record<string, unknown>).text;
        if (typeof text === "string" && text.trim()) {
          return text;
        }
      }
    }
    try {
      return JSON.stringify(result);
    } catch {
      return String(result);
    }
  }

  private toActionResult(
    action: ActionExecutionResult["action"],
    sourceObservationRef: string,
    options: {
      targetElementRef?: string;
      page?: PageIdentity;
      message?: string;
      evidenceRef?: string;
    }
  ): ActionExecutionResult {
    const latestPage = this.session.latestObservation()?.page;
    return {
      action,
      success: true,
      sourceObservationRef,
      targetElementRef: options.targetElementRef,
      page: options.page ?? latestPage ?? this.pageIdentityFromUrl("about:blank", "Unknown"),
      evidenceRef: options.evidenceRef,
      message: options.message,
    };
  }

  private buildScreenshotArgs(
    args: {
      fullPage?: boolean;
      filename?: string;
    },
    options: {
      includeTypeMode: "always" | "optional" | "never";
    }
  ): Record<string, unknown>[] {
    const base: Record<string, unknown> = {};
    if (typeof args.fullPage === "boolean") {
      base.fullPage = args.fullPage;
    }

    const filename = args.filename?.trim();
    const pathVariants: Array<Record<string, unknown>> =
      typeof filename === "string" && filename.length > 0
        ? [
            { ...base, filename },
            { ...base, path: filename },
            { ...base, filePath: filename },
          ]
        : [{ ...base }];

    const variants: Record<string, unknown>[] = [];
    for (const variant of pathVariants) {
      if (options.includeTypeMode === "always" || options.includeTypeMode === "optional") {
        variants.push({ ...variant, type: "png" });
      }
      if (options.includeTypeMode === "optional" || options.includeTypeMode === "never") {
        variants.push(variant);
      }
    }
    return this.uniqueArgs(variants);
  }

  private uniqueArgs(items: Record<string, unknown>[]): Record<string, unknown>[] {
    const seen = new Set<string>();
    const output: Record<string, unknown>[] = [];
    for (const item of items) {
      const key = JSON.stringify(item);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      output.push(item);
    }
    return output;
  }

  private resolveScreenshotEvidenceRef(args: Record<string, unknown>): string | undefined {
    for (const key of ["filename", "path", "filePath"] as const) {
      const value = args[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  }
}
