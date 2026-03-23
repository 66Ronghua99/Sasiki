/**
 * Deps: contracts/tool-client.ts, application/refine/tools/refine-tool-composition.ts
 * Used By: runtime/replay-refinement/react-refinement-run-executor.ts
 * Last Updated: 2026-03-23
 */
import type { ToolCallResult, ToolClient, ToolDefinition } from "../../contracts/tool-client.js";
import type { RefineReactSession } from "./refine-react-session.js";
import { type HitlAnswerProvider } from "./tools/runtime/refine-runtime-tools.js";
import type { RefineToolContextRef } from "./tools/refine-tool-context.js";
import type { RefineToolSurface } from "./tools/refine-tool-surface.js";
import {
  createBootstrapRefineToolComposition,
  createRefineToolComposition,
  type RefineToolComposition,
  type RefineToolCompositionContext,
} from "./tools/refine-tool-composition.js";

export interface RefineReactToolClientOptions {
  rawClient: ToolClient;
  session: RefineReactSession;
  hitlAnswerProvider?: HitlAnswerProvider;
}

export class RefineReactToolClient implements ToolClient {
  private readonly surface: RefineToolSurface<RefineToolCompositionContext>;
  private readonly contextRef: RefineToolContextRef<RefineToolCompositionContext>;

  constructor(options: RefineReactToolClientOptions);
  constructor(
    surface: RefineToolSurface<RefineToolCompositionContext>,
    contextRef: RefineToolContextRef<RefineToolCompositionContext>,
  );
  constructor(options: RefineToolComposition);
  constructor(
    optionsOrSurface:
      | RefineReactToolClientOptions
      | RefineToolComposition
      | RefineToolSurface<RefineToolCompositionContext>,
    contextRef?: RefineToolContextRef<RefineToolCompositionContext>,
  ) {
    if (isRefineToolComposition(optionsOrSurface)) {
      this.surface = optionsOrSurface.surface;
      this.contextRef = optionsOrSurface.contextRef;
      return;
    }

    if (isRefineToolSurface(optionsOrSurface)) {
      if (!contextRef) {
        throw new Error("refine react tool client requires contextRef when constructed from tool surface");
      }
      this.surface = optionsOrSurface;
      this.contextRef = contextRef;
      return;
    }

    const composition = createRefineToolComposition({
      rawClient: optionsOrSurface.rawClient,
      session: optionsOrSurface.session,
      hitlAnswerProvider: optionsOrSurface.hitlAnswerProvider,
    });
    this.surface = composition.surface;
    this.contextRef = composition.contextRef;
  }

  setSession(session: RefineReactSession): void {
    this.contextRef.set({
      ...this.contextRef.get(),
      session,
    });
  }

  setHitlAnswerProvider(provider?: HitlAnswerProvider): void {
    this.contextRef.set({
      ...this.contextRef.get(),
      hitlAnswerProvider: provider,
    });
  }

  getSession(): RefineReactSession {
    return this.contextRef.get().session;
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
  value: RefineReactToolClientOptions | RefineToolComposition | RefineToolSurface<RefineToolCompositionContext>,
): value is RefineToolComposition {
  return "surface" in value && "contextRef" in value && "registry" in value;
}

function isRefineToolSurface(
  value: RefineReactToolClientOptions | RefineToolComposition | RefineToolSurface<RefineToolCompositionContext>,
): value is RefineToolSurface<RefineToolCompositionContext> {
  return Boolean(value) && typeof value === "object" && "callTool" in value && "listTools" in value;
}
