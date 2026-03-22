/**
 * Deps: contracts/tool-client.ts, application/refine/tools/refine-tool-composition.ts
 * Used By: runtime/replay-refinement/react-refinement-run-executor.ts
 * Last Updated: 2026-03-22
 */
import type { ToolCallResult, ToolClient, ToolDefinition } from "../../contracts/tool-client.js";
import type { RefineReactSession } from "./refine-react-session.js";
import { type HitlAnswerProvider } from "./refine-runtime-tools.js";
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
  private readonly composition: RefineToolComposition;

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
      this.composition = optionsOrSurface;
      return;
    }

    if (isRefineToolSurface(optionsOrSurface)) {
      if (!contextRef) {
        throw new Error("refine react tool client requires contextRef when constructed from tool surface");
      }
      this.composition = {
        surface: optionsOrSurface,
        contextRef,
        registry: {
          listDefinitions() {
            throw new Error("registry is unavailable on surface-backed compatibility facade");
          },
          getDefinition() {
            throw new Error("registry is unavailable on surface-backed compatibility facade");
          },
        } as unknown as RefineToolComposition["registry"],
        hookPipeline: {
          async beforeToolCall() {
            return null;
          },
          async afterToolCall(_call, beforeCapture) {
            return beforeCapture;
          },
        },
        hookObserver: {
          async beforeToolCall() {
            return null;
          },
          async afterToolCall() {
            return null;
          },
        },
      };
      return;
    }

    this.composition = createRefineToolComposition({
      rawClient: optionsOrSurface.rawClient,
      session: optionsOrSurface.session,
      hitlAnswerProvider: optionsOrSurface.hitlAnswerProvider,
    });
  }

  setSession(session: RefineReactSession): void {
    this.composition.contextRef.set({
      ...this.composition.contextRef.get(),
      session,
    });
  }

  setHitlAnswerProvider(provider?: HitlAnswerProvider): void {
    this.composition.contextRef.set({
      ...this.composition.contextRef.get(),
      hitlAnswerProvider: provider,
    });
  }

  getSession(): RefineReactSession {
    return this.composition.contextRef.get().session;
  }

  async connect(): Promise<void> {
    await this.composition.surface.connect();
  }

  async disconnect(): Promise<void> {
    await this.composition.surface.disconnect();
  }

  async listTools(): Promise<ToolDefinition[]> {
    return this.composition.surface.listTools();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    return this.composition.surface.callTool(name, args);
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
