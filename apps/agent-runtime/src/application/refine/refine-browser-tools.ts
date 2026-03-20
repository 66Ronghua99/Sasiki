/**
 * Deps: contracts/tool-client.ts, domain/refine-react.ts, application/refine/refine-react-session.ts, application/refine/refine-browser-snapshot-parser.ts
 * Used By: application/refine/refine-react-tool-client.ts
 * Last Updated: 2026-03-20
 */

import type { ToolCallResult, ToolClient } from "../../contracts/tool-client.js";
import type {
  ActionExecutionResult,
  BrowserTabIdentity,
  ObservePageResponse,
  ObserveQueryMatch,
  ObserveQueryRequest,
  ObserveQueryResponse,
  PageIdentity,
  PageObservation,
} from "../../domain/refine-react.js";
import { RefineBrowserSnapshotParser } from "./refine-browser-snapshot-parser.js";
import type { RefineReactSession } from "./refine-react-session.js";

export interface RefineBrowserToolsOptions {
  rawClient: ToolClient;
  session: RefineReactSession;
}

export class RefineBrowserTools {
  private readonly rawClient: ToolClient;
  private readonly parser = new RefineBrowserSnapshotParser();
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
    const metadata = this.parser.parseObservationMetadata(snapshotText);
    const observation: PageObservation = {
      observationRef: this.createObservationRef(),
      page: metadata.page ?? this.parser.pageIdentityFromUrl("about:blank", "Unknown"),
      tabs: metadata.tabs,
      activeTabIndex: metadata.activeTabIndex,
      activeTabMatchesPage: metadata.activeTabMatchesPage,
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
    const sourceObservation = await this.assertActionSourceContext(args.sourceObservationRef);
    const raw = await this.rawClient.callTool("browser_click", { ref: args.elementRef });
    const message = this.readToolText(raw);
    const metadata = this.parser.parseObservationMetadata(message);
    const result = this.toActionResult("click", args.sourceObservationRef, {
      targetElementRef: args.elementRef,
      fallbackPage: sourceObservation.page,
      page: metadata.page,
      tabs: metadata.tabs,
      activeTabIndex: metadata.activeTabIndex,
      message,
      success: this.resolveActionSuccess(raw, message),
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
    const sourceObservation = await this.assertActionSourceContext(args.sourceObservationRef);
    const raw = await this.rawClient.callTool("browser_type", {
      ref: args.elementRef,
      text: args.text,
      submit: args.submit ?? false,
    });
    const message = this.readToolText(raw);
    const metadata = this.parser.parseObservationMetadata(message);
    const result = this.toActionResult("type", args.sourceObservationRef, {
      targetElementRef: args.elementRef,
      fallbackPage: sourceObservation.page,
      page: metadata.page,
      tabs: metadata.tabs,
      activeTabIndex: metadata.activeTabIndex,
      message,
      success: this.resolveActionSuccess(raw, message),
    });
    this.session.recordAction(result);
    return { result };
  }

  async actPress(args: { key: string; sourceObservationRef: string }): Promise<{ result: ActionExecutionResult }> {
    const sourceObservation = await this.assertActionSourceContext(args.sourceObservationRef);
    const raw = await this.rawClient.callTool("browser_press_key", {
      key: args.key,
    });
    const message = this.readToolText(raw);
    const metadata = this.parser.parseObservationMetadata(message);
    const result = this.toActionResult("press", args.sourceObservationRef, {
      fallbackPage: sourceObservation.page,
      page: metadata.page,
      tabs: metadata.tabs,
      activeTabIndex: metadata.activeTabIndex,
      message,
      success: this.resolveActionSuccess(raw, message),
    });
    this.session.recordAction(result);
    return { result };
  }

  async actNavigate(args: { url: string; sourceObservationRef: string }): Promise<{ result: ActionExecutionResult }> {
    const sourceObservation = await this.assertActionSourceContext(args.sourceObservationRef);
    const raw = await this.rawClient.callTool("browser_navigate", {
      url: args.url,
    });
    const message = this.readToolText(raw);
    const metadata = this.parser.parseObservationMetadata(message);
    const result = this.toActionResult("navigate", args.sourceObservationRef, {
      fallbackPage: sourceObservation.page,
      page: metadata.page ?? this.parser.pageIdentityFromUrl(args.url, "navigated"),
      tabs: metadata.tabs,
      activeTabIndex: metadata.activeTabIndex,
      message,
      success: this.resolveActionSuccess(raw, message),
    });
    this.session.recordAction(result);
    return { result };
  }

  async actSelectTab(args: {
    tabIndex: number;
    sourceObservationRef: string;
  }): Promise<{ result: ActionExecutionResult }> {
    const sourceObservation = this.requireSourceObservation(args.sourceObservationRef);
    const raw = await this.rawClient.callTool("browser_tabs", {
      action: "select",
      index: args.tabIndex,
    });
    const message = this.readToolText(raw);
    const metadata = this.parser.parseObservationMetadata(message);
    const result = this.toActionResult("select_tab", args.sourceObservationRef, {
      fallbackPage: sourceObservation.page,
      page: metadata.page,
      tabs: metadata.tabs,
      activeTabIndex: metadata.activeTabIndex,
      message,
      success: this.resolveActionSuccess(raw, message),
    });
    this.session.recordAction(result);
    return { result };
  }

  async actFileUpload(args: {
    sourceObservationRef: string;
    paths?: string[];
  }): Promise<{ result: ActionExecutionResult }> {
    const sourceObservation = await this.assertActionSourceContext(args.sourceObservationRef);
    const raw = await this.rawClient.callTool(
      "browser_file_upload",
      Array.isArray(args.paths) && args.paths.length > 0 ? { paths: args.paths } : {},
    );
    const message = this.readToolText(raw);
    const metadata = this.parser.parseObservationMetadata(message);
    const result = this.toActionResult("file_upload", args.sourceObservationRef, {
      fallbackPage: sourceObservation.page,
      page: metadata.page,
      tabs: metadata.tabs,
      activeTabIndex: metadata.activeTabIndex,
      message,
      success: this.resolveActionSuccess(raw, message),
    });
    this.session.recordAction(result);
    return { result };
  }

  async actScreenshot(args: {
    sourceObservationRef: string;
    fullPage?: boolean;
    filename?: string;
  }): Promise<{ result: ActionExecutionResult }> {
    const sourceObservation = await this.assertActionSourceContext(args.sourceObservationRef);
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
          const message = this.readToolText(raw);
          const metadata = this.parser.parseObservationMetadata(message);
          const result = this.toActionResult("screenshot", args.sourceObservationRef, {
            fallbackPage: sourceObservation.page,
            page: metadata.page,
            tabs: metadata.tabs,
            activeTabIndex: metadata.activeTabIndex,
            message,
            evidenceRef: this.resolveScreenshotEvidenceRef(candidateArgs),
            success: this.resolveActionSuccess(raw, message),
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

  private filterSnapshotLines(observation: PageObservation, request: ObserveQueryRequest): ObserveQueryMatch[] {
    const candidates = this.parser.parseSnapshotElements(observation.snapshot).map((item: { elementRef: string; role: string; rawText: string; normalizedText: string }) => ({
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

  private resolveActionSuccess(raw: ToolCallResult, message: string): boolean {
    if (raw.isError === true) {
      return false;
    }
    if (/"isError"\s*:\s*true/.test(message)) {
      return false;
    }
    if (/###\s*Error\b/i.test(message)) {
      return false;
    }
    return true;
  }

  private toActionResult(
    action: ActionExecutionResult["action"],
    sourceObservationRef: string,
    options: {
      targetElementRef?: string;
      page?: PageIdentity;
      fallbackPage?: PageIdentity;
      tabs?: BrowserTabIdentity[];
      activeTabIndex?: number;
      success?: boolean;
      message?: string;
      evidenceRef?: string;
    }
  ): ActionExecutionResult {
    const latestObservation = this.session.latestObservation();
    return {
      action,
      success: options.success ?? true,
      sourceObservationRef,
      targetElementRef: options.targetElementRef,
      page: options.page ?? latestObservation?.page ?? options.fallbackPage ?? this.parser.pageIdentityFromUrl("about:blank", "Unknown"),
      tabs: options.tabs && options.tabs.length > 0 ? options.tabs : latestObservation?.tabs,
      activeTabIndex:
        typeof options.activeTabIndex === "number" ? options.activeTabIndex : latestObservation?.activeTabIndex,
      evidenceRef: options.evidenceRef,
      message: options.message,
    };
  }

  private requireSourceObservation(sourceObservationRef: string): PageObservation {
    const observation = this.session.findObservation(sourceObservationRef);
    if (!observation) {
      throw new Error(`unknown sourceObservationRef: ${sourceObservationRef}`);
    }
    return observation;
  }

  private async assertActionSourceContext(sourceObservationRef: string): Promise<PageObservation> {
    const sourceObservation = this.requireSourceObservation(sourceObservationRef);
    const sourceActiveTabIndex = sourceObservation.activeTabIndex;
    if (typeof sourceActiveTabIndex !== "number") {
      return sourceObservation;
    }
    const liveTabs = await this.readLiveTabs();
    const liveActiveTab = liveTabs.find((tab) => tab.isActive);
    if (!liveActiveTab) {
      return sourceObservation;
    }
    if (liveActiveTab.index !== sourceActiveTabIndex) {
      throw new Error(
        `sourceObservationRef ${sourceObservationRef} tab mismatch: observed active tab ${sourceActiveTabIndex}, current active tab ${liveActiveTab.index}. call act.select_tab or observe.page before acting`
      );
    }
    return sourceObservation;
  }

  private async readLiveTabs(): Promise<BrowserTabIdentity[]> {
    try {
      const tools = await this.rawClient.listTools();
      const names = new Set(tools.map((tool) => tool.name));
      if (!names.has("browser_tabs")) {
        return [];
      }
      const result = await this.rawClient.callTool("browser_tabs", { action: "list" });
      const metadata = this.parser.parseObservationMetadata(this.readToolText(result));
      return metadata.tabs;
    } catch {
      return [];
    }
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
