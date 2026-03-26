/**
 * Deps: contracts/tool-client.ts, domain/refine-react.ts, application/refine/refine-react-session.ts, application/refine/refine-browser-snapshot-parser.ts
 * Used By: application/refine/tools/refine-tool-composition.ts, application/refine/refine-react-tool-client.ts
 * Last Updated: 2026-03-24
 */
import type { ToolCallResult, ToolClient } from "../../../../contracts/tool-client.js";
import type {
  ActionExecutionResult,
  ObservePageResponse,
  ObserveQueryRequest,
  ObserveQueryResponse,
  PageObservation,
} from "../../../../domain/refine-react.js";
import type { PageKnowledge } from "../../../../domain/attention-knowledge.js";
import type { AttentionGuidanceLoader } from "../../../refine/attention-guidance-loader.js";
import type { RefineReactSession } from "../../refine-react-session.js";
import { RefineBrowserSnapshotParser } from "../../refine-browser-snapshot-parser.js";
import {
  assertActionSourceContext,
  buildScreenshotArgs,
  filterSnapshotLines,
  isScreenshotFailure,
  readScreenshotEvidenceRef,
  readToolText,
  requireSourceObservation,
  resolveActionSuccess,
  toActionResult,
} from "./refine-browser-service-helpers.js";
import {
  captureStabilizedObservation,
  type ObservationStabilizerSettings,
} from "./refine-browser-observation-stabilizer.js";

export interface RefineBrowserService {
  getSession(): RefineReactSession;
  setSession(session: RefineReactSession): void;
  capturePageObservation(): Promise<ObservePageResponse>;
  queryObservation(request: ObserveQueryRequest): Promise<ObserveQueryResponse>;
  clickFromObservation(args: { elementRef: string; sourceObservationRef: string }): Promise<{ result: ActionExecutionResult }>;
  typeIntoElement(args: {
    elementRef: string;
    sourceObservationRef: string;
    text: string;
    submit?: boolean;
  }): Promise<{ result: ActionExecutionResult }>;
  pressKey(args: { key: string; sourceObservationRef: string }): Promise<{ result: ActionExecutionResult }>;
  navigateFromObservation(args: { url: string; sourceObservationRef: string }): Promise<{ result: ActionExecutionResult }>;
  switchActiveTab(args: { tabIndex: number; sourceObservationRef: string }): Promise<{ result: ActionExecutionResult }>;
  captureScreenshot(args: { sourceObservationRef: string; fullPage?: boolean; filename?: string }): Promise<{
    result: ActionExecutionResult;
  }>;
  handleFileUpload(args: { sourceObservationRef: string; paths?: string[] }): Promise<{ result: ActionExecutionResult }>;
}

export interface RefineBrowserServiceOptions {
  rawClient: ToolClient;
  session: RefineReactSession;
  guidanceLoader?: Pick<AttentionGuidanceLoader, "load">;
  knowledgeTopN?: number;
  stabilizationSettings?: Partial<ObservationStabilizerSettings>;
}

export class RefineBrowserServiceImpl implements RefineBrowserService {
  private readonly rawClient: ToolClient;
  private readonly guidanceLoader?: Pick<AttentionGuidanceLoader, "load">;
  private readonly knowledgeTopN: number;
  private readonly parser = new RefineBrowserSnapshotParser();
  private readonly stabilizationSettings: Partial<ObservationStabilizerSettings>;
  private currentSession: RefineReactSession;
  private observationCounter = 0;
  private rawToolNamesPromise: Promise<Set<string>> | null = null;

  constructor(options: RefineBrowserServiceOptions) {
    this.rawClient = options.rawClient;
    this.guidanceLoader = options.guidanceLoader;
    this.knowledgeTopN = Math.max(1, options.knowledgeTopN ?? 8);
    this.stabilizationSettings = options.stabilizationSettings ?? {};
    this.currentSession = options.session;
  }

  getSession(): RefineReactSession {
    return this.currentSession;
  }

  setSession(session: RefineReactSession): void {
    this.currentSession = session;
    this.observationCounter = 0;
  }

  async capturePageObservation(): Promise<ObservePageResponse> {
    await this.alignObservationTargetBeforeSnapshot();
    const stabilizedObservation = await captureStabilizedObservation(
      this.rawClient,
      this.parser,
      this.stabilizationSettings,
    );
    const observation: PageObservation = {
      observationRef: this.createObservationRef(),
      page: stabilizedObservation.metadata.page ?? this.parser.pageIdentityFromUrl("about:blank", "Unknown"),
      tabs: stabilizedObservation.metadata.tabs,
      activeTabIndex: stabilizedObservation.metadata.activeTabIndex,
      activeTabMatchesPage: stabilizedObservation.metadata.activeTabMatchesPage,
      observationReadiness: stabilizedObservation.readiness,
      pageTab: stabilizedObservation.metadata.pageTab,
      taskRelevantTabs: stabilizedObservation.metadata.taskRelevantTabs,
      snapshot: stabilizedObservation.snapshot,
      capturedAt: new Date().toISOString(),
    };
    this.currentSession.recordObservation(observation);
    return {
      observation,
      pageKnowledge: await this.loadPageKnowledge(observation.page),
    };
  }

  async queryObservation(request: ObserveQueryRequest): Promise<ObserveQueryResponse> {
    const observation = this.currentSession.latestObservation();
    if (!observation) {
      throw new Error("observe.query requires an existing observation; call observe.page first");
    }
    const matches = filterSnapshotLines(this.parser, observation, request);
    return {
      observationRef: observation.observationRef,
      page: {
        origin: observation.page.origin,
        normalizedPath: observation.page.normalizedPath,
      },
      matches,
    };
  }

  async clickFromObservation(args: {
    elementRef: string;
    sourceObservationRef: string;
  }): Promise<{ result: ActionExecutionResult }> {
    const sourceObservation = await assertActionSourceContext(
      this.rawClient,
      this.parser,
      this.currentSession,
      args.sourceObservationRef,
    );
    const raw = await this.rawClient.callTool("browser_click", { ref: args.elementRef });
    const message = readToolText(raw);
    const metadata = this.parser.parseObservationMetadata(message);
    const result = toActionResult(this.currentSession.latestObservation(), this.parser, "click", args.sourceObservationRef, {
      targetElementRef: args.elementRef,
      fallbackPage: sourceObservation.page,
      page: metadata.page,
      tabs: metadata.tabs,
      activeTabIndex: metadata.activeTabIndex,
      message,
      success: resolveActionSuccess(raw, message),
    });
    this.currentSession.recordAction(result);
    return { result };
  }

  async typeIntoElement(args: {
    elementRef: string;
    sourceObservationRef: string;
    text: string;
    submit?: boolean;
  }): Promise<{ result: ActionExecutionResult }> {
    const sourceObservation = await assertActionSourceContext(
      this.rawClient,
      this.parser,
      this.currentSession,
      args.sourceObservationRef,
    );
    const raw = await this.rawClient.callTool("browser_type", {
      ref: args.elementRef,
      text: args.text,
      submit: args.submit ?? false,
    });
    const message = readToolText(raw);
    const metadata = this.parser.parseObservationMetadata(message);
    const result = toActionResult(this.currentSession.latestObservation(), this.parser, "type", args.sourceObservationRef, {
      targetElementRef: args.elementRef,
      fallbackPage: sourceObservation.page,
      page: metadata.page,
      tabs: metadata.tabs,
      activeTabIndex: metadata.activeTabIndex,
      message,
      success: resolveActionSuccess(raw, message),
    });
    this.currentSession.recordAction(result);
    return { result };
  }

  async pressKey(args: { key: string; sourceObservationRef: string }): Promise<{ result: ActionExecutionResult }> {
    const sourceObservation = await assertActionSourceContext(
      this.rawClient,
      this.parser,
      this.currentSession,
      args.sourceObservationRef,
    );
    const raw = await this.rawClient.callTool("browser_press_key", {
      key: args.key,
    });
    const message = readToolText(raw);
    const metadata = this.parser.parseObservationMetadata(message);
    const result = toActionResult(this.currentSession.latestObservation(), this.parser, "press", args.sourceObservationRef, {
      fallbackPage: sourceObservation.page,
      page: metadata.page,
      tabs: metadata.tabs,
      activeTabIndex: metadata.activeTabIndex,
      message,
      success: resolveActionSuccess(raw, message),
    });
    this.currentSession.recordAction(result);
    return { result };
  }

  async navigateFromObservation(args: {
    url: string;
    sourceObservationRef: string;
  }): Promise<{ result: ActionExecutionResult }> {
    const sourceObservation = await assertActionSourceContext(
      this.rawClient,
      this.parser,
      this.currentSession,
      args.sourceObservationRef,
    );
    const raw = await this.rawClient.callTool("browser_navigate", {
      url: args.url,
    });
    const alignedRaw = await this.realignVisibleTabAfterNavigate(raw);
    const message = readToolText(alignedRaw ?? raw);
    const metadata = this.parser.parseObservationMetadata(message);
    const result = toActionResult(this.currentSession.latestObservation(), this.parser, "navigate", args.sourceObservationRef, {
      fallbackPage: sourceObservation.page,
      page: metadata.page ?? this.parser.pageIdentityFromUrl(args.url, "navigated"),
      tabs: metadata.tabs,
      activeTabIndex: metadata.activeTabIndex,
      message,
      success: resolveActionSuccess(alignedRaw ?? raw, message),
    });
    this.currentSession.recordAction(result);
    return { result };
  }

  async switchActiveTab(args: {
    tabIndex: number;
    sourceObservationRef: string;
  }): Promise<{ result: ActionExecutionResult }> {
    const sourceObservation = requireSourceObservation(this.currentSession, args.sourceObservationRef);
    const raw = await this.rawClient.callTool("browser_tabs", {
      action: "select",
      index: args.tabIndex,
    });
    const message = readToolText(raw);
    const metadata = this.parser.parseObservationMetadata(message);
    const result = toActionResult(this.currentSession.latestObservation(), this.parser, "select_tab", args.sourceObservationRef, {
      fallbackPage: sourceObservation.page,
      page: metadata.page,
      tabs: metadata.tabs,
      activeTabIndex: metadata.activeTabIndex,
      message,
      success: resolveActionSuccess(raw, message),
    });
    this.currentSession.recordAction(result);
    return { result };
  }

  async captureScreenshot(args: {
    sourceObservationRef: string;
    fullPage?: boolean;
    filename?: string;
  }): Promise<{ result: ActionExecutionResult }> {
    const sourceObservation = await assertActionSourceContext(
      this.rawClient,
      this.parser,
      this.currentSession,
      args.sourceObservationRef,
    );
    const rawTools = await this.rawClient.listTools();
    const names = new Set(rawTools.map((tool) => tool.name));
    const candidates: Array<{
      name: string;
      args: Record<string, unknown>[];
    }> = [
      {
        name: "browser_take_screenshot",
        args: buildScreenshotArgs(args, {
          includeTypeMode: "always",
        }),
      },
      {
        name: "browser_screenshot",
        args: buildScreenshotArgs(args, {
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
          const message = readToolText(raw);
          if (isScreenshotFailure(raw, message)) {
            lastError = new Error(`browser screenshot returned an error: ${message}`);
            continue;
          }
          const metadata = this.parser.parseObservationMetadata(message);
          const result = toActionResult(this.currentSession.latestObservation(), this.parser, "screenshot", args.sourceObservationRef, {
            fallbackPage: sourceObservation.page,
            page: metadata.page,
            tabs: metadata.tabs,
            activeTabIndex: metadata.activeTabIndex,
            message,
            evidenceRef: readScreenshotEvidenceRef(candidateArgs),
            success: resolveActionSuccess(raw, message),
          });
          this.currentSession.recordAction(result);
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

  async handleFileUpload(args: {
    sourceObservationRef: string;
    paths?: string[];
  }): Promise<{ result: ActionExecutionResult }> {
    const sourceObservation = await assertActionSourceContext(
      this.rawClient,
      this.parser,
      this.currentSession,
      args.sourceObservationRef,
    );
    const raw = await this.rawClient.callTool(
      "browser_file_upload",
      Array.isArray(args.paths) && args.paths.length > 0 ? { paths: args.paths } : {},
    );
    const message = readToolText(raw);
    const metadata = this.parser.parseObservationMetadata(message);
    const result = toActionResult(this.currentSession.latestObservation(), this.parser, "file_upload", args.sourceObservationRef, {
      fallbackPage: sourceObservation.page,
      page: metadata.page,
      tabs: metadata.tabs,
      activeTabIndex: metadata.activeTabIndex,
      message,
      success: resolveActionSuccess(raw, message),
    });
    this.currentSession.recordAction(result);
    return { result };
  }

  private createObservationRef(): string {
    this.observationCounter += 1;
    return `obs_${this.currentSession.runId}_${this.observationCounter}`;
  }

  private async alignObservationTargetBeforeSnapshot(): Promise<void> {
    if (!(await this.supportsRawTool("browser_tabs"))) {
      return;
    }
    const rawList = await this.rawClient.callTool("browser_tabs", { action: "list" });
    const metadata = this.parser.parseObservationMetadata(readToolText(rawList));
    const activeTab = metadata.tabs.find((tab) => tab.isActive);
    if (!activeTab || this.isObservationReadyTab(activeTab.url)) {
      return;
    }
    const candidate =
      metadata.tabs.find((tab) => this.isBusinessTab(tab.url)) ??
      metadata.tabs.find((tab) => this.isBootstrapBlankTab(tab.url));
    if (!candidate || candidate.index === activeTab.index) {
      return;
    }
    await this.rawClient.callTool("browser_tabs", {
      action: "select",
      index: candidate.index,
    });
  }

  private isObservationReadyTab(url: string): boolean {
    return this.isBusinessTab(url) || this.isBootstrapBlankTab(url);
  }

  private isBusinessTab(url: string): boolean {
    const normalized = url.trim().toLowerCase();
    return normalized.startsWith("http://") || normalized.startsWith("https://");
  }

  private isBootstrapBlankTab(url: string): boolean {
    return url.trim().toLowerCase() === "about:blank";
  }

  private async realignVisibleTabAfterNavigate(rawNavigateResult: ToolCallResult): Promise<ToolCallResult | null> {
    const message = readToolText(rawNavigateResult);
    const metadata = this.parser.parseObservationMetadata(message);
    if (typeof metadata.activeTabIndex !== "number") {
      return null;
    }
    if (!(await this.supportsRawTool("browser_tabs"))) {
      return null;
    }
    return this.rawClient.callTool("browser_tabs", {
      action: "select",
      index: metadata.activeTabIndex,
    });
  }

  private async loadPageKnowledge(page: PageObservation["page"]): Promise<PageKnowledge[]> {
    if (!this.guidanceLoader) {
      return [];
    }
    const loaded = await this.guidanceLoader.load({
      page: {
        origin: page.origin,
        normalizedPath: page.normalizedPath,
      },
      limit: this.knowledgeTopN,
    });
    return loaded.records.map((record) => ({
      guide: record.guide,
      keywords: [...record.keywords],
    }));
  }

  private async supportsRawTool(name: string): Promise<boolean> {
    if (!this.rawToolNamesPromise) {
      this.rawToolNamesPromise = this.rawClient
        .listTools()
        .then((tools) => new Set(tools.map((tool) => tool.name)));
    }
    return (await this.rawToolNamesPromise).has(name);
  }
}
