import type { ToolClient } from "../../../contracts/tool-client.js";
import type { PiAgentToolHookRegistry } from "../../../kernel/pi-agent-tool-hooks.js";
import { createRefineReactSession, type RefineReactSession } from "../refine-react-session.js";
import { RefineBrowserTools } from "./runtime/refine-browser-tools.js";
import { RefineRuntimeTools, type HitlAnswerProvider } from "./runtime/refine-runtime-tools.js";
import { createRefineBrowserToolRegistry } from "./refine-browser-tool-registry.js";
import { createRefineRuntimeToolRegistry } from "./refine-runtime-tool-registry.js";
import { RefineToolRegistry } from "./refine-tool-registry.js";
import { createRefineToolContextRef, type RefineToolContext, type RefineToolContextRef } from "./refine-tool-context.js";
import { createRefinePiAgentToolHooks } from "./refine-pi-agent-tool-hooks.js";
import { RefineToolSurface } from "./refine-tool-surface.js";
import { RefineToolSurfaceLifecycleCoordinator } from "./refine-tool-surface-lifecycle.js";
import { RefineBrowserProviderImpl, type RefineBrowserProvider } from "./providers/refine-browser-provider.js";
import { RefineRuntimeProviderImpl, type RefineRuntimeProvider } from "./providers/refine-runtime-provider.js";
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
  hookPipeline: RefineToolHookPipeline<RefineToolCompositionContext, undefined>;
  toolHooks: PiAgentToolHookRegistry;
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
  const toolHooks = createRefinePiAgentToolHooks({
    registry,
    pipeline: hookPipeline,
    resolveContext() {
      return contextRef.get();
    },
  });
  const surface = new RefineToolSurface({
    registry,
    contextRef,
    lifecycle: new RefineToolSurfaceLifecycleCoordinator({
      participants: [rawClient],
    }),
  });

  return {
    contextRef,
    registry,
    surface,
    hookPipeline,
    toolHooks,
  };
}

export function createBootstrapRefineToolComposition(rawClient: ToolClient): RefineToolComposition {
  return createRefineToolComposition({
    rawToolClient: rawClient,
  });
}

function createNoOpHookPipeline(): RefineToolHookPipeline<RefineToolCompositionContext, undefined> {
  return createRefineToolHookPipeline<RefineToolCompositionContext, undefined>({
    async beforeToolCall() {
      return undefined;
    },
    async afterToolCall(_call, beforeCapture) {
      return beforeCapture;
    },
  });
}
