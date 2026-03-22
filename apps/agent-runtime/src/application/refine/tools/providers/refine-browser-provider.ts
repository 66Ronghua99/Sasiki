import type {
  ActionExecutionResult,
  ObservePageResponse,
  ObserveQueryRequest,
  ObserveQueryResponse,
} from "../../../../domain/refine-react.js";
import type { RefineToolContext, RefineToolContextRef } from "../refine-tool-context.js";
import type { RefineReactSession } from "../../refine-react-session.js";
import { RefineBrowserTools, type RefineBrowserToolProviderContext } from "../../refine-browser-tools.js";

export interface RefineBrowserProviderContext extends RefineToolContext, RefineBrowserToolProviderContext {}

export interface RefineBrowserProvider {
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

export interface RefineBrowserProviderOptions {
  tools: RefineBrowserTools;
  contextRef: RefineToolContextRef<RefineBrowserProviderContext>;
}

export class RefineBrowserProviderImpl implements RefineBrowserProvider {
  private readonly tools: RefineBrowserTools;
  private readonly contextRef: RefineToolContextRef<RefineBrowserProviderContext>;

  constructor(options: RefineBrowserProviderOptions) {
    this.tools = options.tools;
    this.contextRef = options.contextRef;
  }

  async capturePageObservation(): Promise<ObservePageResponse> {
    this.syncSession();
    return this.tools.observePage();
  }

  async queryObservation(request: ObserveQueryRequest): Promise<ObserveQueryResponse> {
    this.syncSession();
    return this.tools.observeQuery(request);
  }

  async clickFromObservation(args: {
    elementRef: string;
    sourceObservationRef: string;
  }): Promise<{ result: ActionExecutionResult }> {
    this.syncSession();
    return this.tools.actClick(args);
  }

  async typeIntoElement(args: {
    elementRef: string;
    sourceObservationRef: string;
    text: string;
    submit?: boolean;
  }): Promise<{ result: ActionExecutionResult }> {
    this.syncSession();
    return this.tools.actType(args);
  }

  async pressKey(args: { key: string; sourceObservationRef: string }): Promise<{ result: ActionExecutionResult }> {
    this.syncSession();
    return this.tools.actPress(args);
  }

  async navigateFromObservation(args: {
    url: string;
    sourceObservationRef: string;
  }): Promise<{ result: ActionExecutionResult }> {
    this.syncSession();
    return this.tools.actNavigate(args);
  }

  async switchActiveTab(args: {
    tabIndex: number;
    sourceObservationRef: string;
  }): Promise<{ result: ActionExecutionResult }> {
    this.syncSession();
    return this.tools.actSelectTab(args);
  }

  async captureScreenshot(args: {
    sourceObservationRef: string;
    fullPage?: boolean;
    filename?: string;
  }): Promise<{ result: ActionExecutionResult }> {
    this.syncSession();
    return this.tools.actScreenshot(args);
  }

  async handleFileUpload(args: {
    sourceObservationRef: string;
    paths?: string[];
  }): Promise<{ result: ActionExecutionResult }> {
    this.syncSession();
    return this.tools.actFileUpload(args);
  }

  private syncSession(): RefineReactSession {
    const context = this.contextRef.get();
    this.tools.setProviderContext(context);
    return context.session;
  }
}
