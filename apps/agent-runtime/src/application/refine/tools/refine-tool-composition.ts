import type { ToolClient } from "../../../contracts/tool-client.js";
import type { McpToolCallHookObserver, ToolCallHookCapture } from "../../../kernel/mcp-tool-bridge.js";
import { createRefineReactSession, type RefineReactSession } from "../refine-react-session.js";
import { RefineBrowserTools } from "./runtime/refine-browser-tools.js";
import { RefineRuntimeTools, type HitlAnswerProvider } from "./runtime/refine-runtime-tools.js";
import { createRefineBrowserToolRegistry } from "./refine-browser-tool-registry.js";
import { createRefineRuntimeToolRegistry } from "./refine-runtime-tool-registry.js";
import { RefineToolRegistry } from "./refine-tool-registry.js";
import { createRefineToolContextRef, type RefineToolContext, type RefineToolContextRef } from "./refine-tool-context.js";
import { RefineToolSurface } from "./refine-tool-surface.js";
import { RefineToolSurfaceLifecycleCoordinator } from "./refine-tool-surface-lifecycle.js";
import { RefineBrowserProviderImpl, type RefineBrowserProvider } from "./providers/refine-browser-provider.js";
import { RefineRuntimeProviderImpl, type RefineRuntimeProvider } from "./providers/refine-runtime-provider.js";
import { createRefineToolHookObserver } from "./refine-tool-hook-observer.js";
import { createRefineToolHookPipeline, type RefineToolHookPipeline } from "./refine-tool-hook-pipeline.js";

export interface RefineToolCompositionContext extends RefineToolContext {
  session: RefineReactSession;
  hitlAnswerProvider?: HitlAnswerProvider;
  browser?: RefineBrowserProvider;
  runtime?: RefineRuntimeProvider;
}

export interface RefineToolCompositionInput {
  rawClient?: ToolClient;
  rawToolClient?: ToolClient;
  session?: RefineReactSession;
  hitlAnswerProvider?: HitlAnswerProvider;
}

export interface RefineToolComposition {
  contextRef: RefineToolContextRef<RefineToolCompositionContext>;
  registry: RefineToolRegistry;
  surface: RefineToolSurface<RefineToolCompositionContext>;
  hookPipeline: RefineToolHookPipeline<RefineToolCompositionContext, ToolCallHookCapture | null>;
  hookObserver: McpToolCallHookObserver;
}

export function createRefineToolComposition(input: RefineToolCompositionInput): RefineToolComposition {
  const rawClient = input.rawToolClient ?? input.rawClient;
  if (!rawClient) {
    throw new Error("refine tool composition requires raw tool client");
  }
  const session =
    input.session ?? createRefineReactSession("bootstrap", "bootstrap", { taskScope: "bootstrap" });
  const contextRef = createRefineToolContextRef<RefineToolCompositionContext>({
    session,
    hitlAnswerProvider: input.hitlAnswerProvider,
  });
  const browserTools = new RefineBrowserTools({
    rawClient,
    session,
  });
  const runtimeTools = new RefineRuntimeTools({
    session,
    hitlAnswerProvider: input.hitlAnswerProvider,
  });
  const browser = new RefineBrowserProviderImpl({
    tools: browserTools,
    contextRef: contextRef as never,
  });
  const runtime = new RefineRuntimeProviderImpl({
    tools: runtimeTools,
    contextRef: contextRef as never,
  });
  contextRef.set({
    ...contextRef.get(),
    browser,
    runtime,
  });

  const registry = new RefineToolRegistry({
    definitions: [
      ...createRefineBrowserToolRegistry().listDefinitions(),
      ...createRefineRuntimeToolRegistry().listDefinitions(),
    ],
  });
  const hookPipeline = createNoOpHookPipeline();
  const surface = new RefineToolSurface({
    registry,
    contextRef,
    hookPipeline,
    lifecycle: new RefineToolSurfaceLifecycleCoordinator({
      participants: [rawClient],
    }),
  });
  const hookObserver = createRefineToolHookObserver({
    pipeline: hookPipeline,
    resolveContext() {
      return contextRef.get();
    },
  });

  return {
    contextRef,
    registry,
    surface,
    hookPipeline,
    hookObserver,
  };
}

export function createBootstrapRefineToolComposition(rawClient: ToolClient): RefineToolComposition {
  return createRefineToolComposition({
    rawToolClient: rawClient,
  });
}

function createNoOpHookPipeline(): RefineToolHookPipeline<RefineToolCompositionContext, ToolCallHookCapture | null> {
  return createRefineToolHookPipeline<RefineToolCompositionContext, ToolCallHookCapture | null>({
    async beforeToolCall() {
      return null;
    },
    async afterToolCall(_call, beforeCapture) {
      return beforeCapture;
    },
  });
}
