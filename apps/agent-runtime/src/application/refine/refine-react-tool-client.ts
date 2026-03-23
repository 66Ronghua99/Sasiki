/**
 * Deps: contracts/tool-client.ts, application/refine/tools/refine-tool-composition.ts
 * Used By: runtime/replay-refinement/react-refinement-run-executor.ts
 * Last Updated: 2026-03-23
 */
import type { ToolCallResult, ToolClient, ToolDefinition } from "../../contracts/tool-client.js";
import type { RefineReactSession } from "./refine-react-session.js";
import { type HitlAnswerProvider } from "./tools/services/refine-run-service.js";
import {
  createBootstrapRefineToolComposition,
  createRefineToolComposition,
  type RefineToolComposition,
} from "./tools/refine-tool-composition.js";

export interface RefineReactToolClientOptions {
  rawClient: ToolClient;
  session: RefineReactSession;
  hitlAnswerProvider?: HitlAnswerProvider;
}

export class RefineReactToolClient implements ToolClient {
  private readonly surface: RefineToolComposition["surface"];
  private readonly contextRef: RefineToolComposition["contextRef"];

  constructor(options: RefineReactToolClientOptions);
  constructor(options: RefineToolComposition);
  constructor(optionsOrComposition: RefineReactToolClientOptions | RefineToolComposition) {
    if (isRefineToolComposition(optionsOrComposition)) {
      this.surface = optionsOrComposition.surface;
      this.contextRef = optionsOrComposition.contextRef;
      return;
    }

    const composition = createRefineToolComposition({
      rawClient: optionsOrComposition.rawClient,
      session: optionsOrComposition.session,
      hitlAnswerProvider: optionsOrComposition.hitlAnswerProvider,
    });
    this.surface = composition.surface;
    this.contextRef = composition.contextRef;
  }

  setSession(session: RefineReactSession): void {
    const context = this.contextRef.get();
    const browserService = context.browserService;
    const runService = context.runService;
    if (!browserService && !runService) {
      throw new Error("invalid refine tool context: browserService or runService is required");
    }
    browserService?.setSession(session);
    runService?.setSession(session);
  }

  setHitlAnswerProvider(provider?: HitlAnswerProvider): void {
    const runService = this.contextRef.get().runService;
    if (!runService) {
      throw new Error("invalid refine tool context: runService is required");
    }
    runService.setHitlAnswerProvider(provider);
  }

  getSession(): RefineReactSession {
    const context = this.contextRef.get();
    const runService = context.runService;
    if (runService) {
      return runService.getSession();
    }
    const browserService = context.browserService;
    if (browserService) {
      return browserService.getSession();
    }
    throw new Error("invalid refine tool context: browserService or runService is required");
  }

  async connect(): Promise<void> {
    await this.surface.connect();
  }

  async disconnect(): Promise<void> {
    await this.surface.disconnect();
  }

  async listTools(): Promise<ToolDefinition[]> {
    return this.surface.listTools();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    return this.surface.callTool(name, args);
  }
}

export function createBootstrapRefineReactToolClient(rawClient: ToolClient): RefineReactToolClient {
  return new RefineReactToolClient(createBootstrapRefineToolComposition(rawClient));
}

function isRefineToolComposition(
  value: RefineReactToolClientOptions | RefineToolComposition,
): value is RefineToolComposition {
  return "surface" in value && "contextRef" in value && "registry" in value;
}
